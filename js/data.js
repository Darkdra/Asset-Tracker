import {
  collection, doc, getDocs, addDoc, setDoc, updateDoc, deleteDoc,
  query, orderBy, where, writeBatch, serverTimestamp,
} from "https://www.gstatic.com/firebasejs/12.17.1/firebase-firestore.js";
import { db } from "./firebase-init.js";

const usersCol = () => collection(db, "users");
const userDoc = (uid) => doc(db, "users", uid);
const categoriesCol = (uid) => collection(db, "users", uid, "categories");
const categoryDoc = (uid, catId) => doc(db, "users", uid, "categories", catId);
const sectionsCol = (uid, catId) => collection(db, "users", uid, "categories", catId, "sections");
const sectionDoc = (uid, catId, secId) => doc(db, "users", uid, "categories", catId, "sections", secId);
const itemsCol = (uid, catId, secId) =>
  collection(db, "users", uid, "categories", catId, "sections", secId, "items");
const itemDoc = (uid, catId, secId, itemId) =>
  doc(db, "users", uid, "categories", catId, "sections", secId, "items", itemId);
const snapshotsCol = (uid) => collection(db, "users", uid, "networthSnapshots");

const DEFAULT_CATEGORIES = [
  { name: "Banks", icon: "🏦", order: 0 },
  { name: "Investment", icon: "📈", order: 1 },
];

/* ---------------------------- Categories ---------------------------- */

export async function ensureSeedData(uid) {
  const snap = await getDocs(categoriesCol(uid));
  if (!snap.empty) return;
  for (const cat of DEFAULT_CATEGORIES) {
    await addDoc(categoriesCol(uid), cat);
  }
}

export async function getCategories(uid) {
  const snap = await getDocs(query(categoriesCol(uid), orderBy("order", "asc")));
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}

export async function addCategory(uid, { name, icon }) {
  const existing = await getCategories(uid);
  return addDoc(categoriesCol(uid), { name, icon, order: existing.length });
}

export async function deleteCategoryDeep(uid, catId) {
  const sections = await getDocs(sectionsCol(uid, catId));
  for (const secDoc of sections.docs) {
    await deleteSectionDeep(uid, catId, secDoc.id);
  }
  await deleteDoc(categoryDoc(uid, catId));
}

/* ----------------------------- Sections ------------------------------ */

export async function getSections(uid, catId) {
  const snap = await getDocs(query(sectionsCol(uid, catId), orderBy("order", "asc")));
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}

export async function addSection(uid, catId, name) {
  const existing = await getSections(uid, catId);
  return addDoc(sectionsCol(uid, catId), { name, order: existing.length });
}

export async function deleteSectionDeep(uid, catId, secId) {
  const items = await getDocs(itemsCol(uid, catId, secId));
  const batch = writeBatch(db);
  items.docs.forEach((d) => batch.delete(d.ref));
  if (items.docs.length) await batch.commit();
  await deleteDoc(sectionDoc(uid, catId, secId));
}

/* ------------------------------- Items -------------------------------- */

export async function getItems(uid, catId, secId) {
  const snap = await getDocs(query(itemsCol(uid, catId, secId), orderBy("order", "asc")));
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}

export async function addItem(uid, catId, secId, { name, value }) {
  const existing = await getItems(uid, catId, secId);
  return addDoc(itemsCol(uid, catId, secId), { name, value, order: existing.length });
}

export async function updateItemValue(uid, catId, secId, itemId, value) {
  return updateDoc(itemDoc(uid, catId, secId, itemId), { value, updatedAt: serverTimestamp() });
}

export async function deleteItem(uid, catId, secId, itemId) {
  return deleteDoc(itemDoc(uid, catId, secId, itemId));
}

/* --------------------------- Net worth math ---------------------------- */

// Sums every item across every section of a single category.
export async function getCategoryTotal(uid, catId) {
  const sections = await getSections(uid, catId);
  let total = 0;
  for (const sec of sections) {
    const items = await getItems(uid, catId, sec.id);
    total += items.reduce((sum, it) => sum + (Number(it.value) || 0), 0);
  }
  return total;
}

// Sums every category → the full net worth.
export async function getNetWorth(uid) {
  const categories = await getCategories(uid);
  let total = 0;
  const perCategory = {};
  for (const cat of categories) {
    const t = await getCategoryTotal(uid, cat.id);
    perCategory[cat.id] = t;
    total += t;
  }
  return { total, perCategory };
}

// Upserts today's net worth into the history so the performance chart
// has a data point for "today" every time a value changes.
export async function recordSnapshot(uid, total) {
  const today = new Date().toISOString().slice(0, 10); // YYYY-MM-DD
  await setDoc(
    doc(db, "users", uid, "networthSnapshots", today),
    { date: today, total, updatedAt: serverTimestamp() },
    { merge: true }
  );
}

export async function getSnapshots(uid, sinceDate /* 'YYYY-MM-DD' | null */) {
  let q = query(snapshotsCol(uid), orderBy("date", "asc"));
  if (sinceDate) {
    q = query(snapshotsCol(uid), where("date", ">=", sinceDate), orderBy("date", "asc"));
  }
  const snap = await getDocs(q);
  return snap.docs.map((d) => d.data());
}

/* ------------------------------ Settings ------------------------------- */
// (Kept for future use — theme is currently stored in localStorage instead,
// see js/theme.js.)
export async function touchUserDoc(uid, email) {
  await setDoc(userDoc(uid), { email }, { merge: true });
}
