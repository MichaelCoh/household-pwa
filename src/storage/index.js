import AsyncStorage from '@react-native-async-storage/async-storage';

const KEYS = {
  SHOPPING_LISTS: 'hh_shopping_lists',
  SHOPPING_ITEMS: 'hh_shopping_items',
  TASKS: 'hh_tasks',
  EVENTS: 'hh_events',
  EXPENSES: 'hh_expenses',
  SETTINGS: 'hh_settings',
};

const genId = () => `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

async function load(key) {
  try {
    const raw = await AsyncStorage.getItem(key);
    return raw ? JSON.parse(raw) : [];
  } catch { return []; }
}

async function save(key, data) {
  await AsyncStorage.setItem(key, JSON.stringify(data));
}

// ─── Shopping Lists ────────────────────────────────────────────────────────
export const ShoppingListStorage = {
  getLists: () => load(KEYS.SHOPPING_LISTS),

  createList: async (name, emoji = '🛒', color = '#00BFA5') => {
    const lists = await load(KEYS.SHOPPING_LISTS);
    const list = { id: genId(), name, emoji, color, createdAt: Date.now() };
    await save(KEYS.SHOPPING_LISTS, [list, ...lists]);
    return list;
  },

  updateList: async (id, changes) => {
    const lists = await load(KEYS.SHOPPING_LISTS);
    await save(KEYS.SHOPPING_LISTS, lists.map(l => l.id === id ? { ...l, ...changes } : l));
  },

  deleteList: async (id) => {
    const lists = await load(KEYS.SHOPPING_LISTS);
    await save(KEYS.SHOPPING_LISTS, lists.filter(l => l.id !== id));
    // also delete all items in this list
    const items = await load(KEYS.SHOPPING_ITEMS);
    await save(KEYS.SHOPPING_ITEMS, items.filter(i => i.listId !== id));
  },

  // ── Items ──
  getItems: async (listId) => {
    const items = await load(KEYS.SHOPPING_ITEMS);
    return items.filter(i => i.listId === listId);
  },

  getAllItems: () => load(KEYS.SHOPPING_ITEMS),

  addItem: async (listId, name, qty = 1, unit = '', category = 'General', notes = '') => {
    const items = await load(KEYS.SHOPPING_ITEMS);
    const item = {
      id: genId(), listId, name, qty, unit, category, notes,
      checked: false, createdAt: Date.now(),
    };
    await save(KEYS.SHOPPING_ITEMS, [item, ...items]);
    return item;
  },

  toggleItem: async (id) => {
    const items = await load(KEYS.SHOPPING_ITEMS);
    await save(KEYS.SHOPPING_ITEMS, items.map(i =>
      i.id === id ? { ...i, checked: !i.checked, checkedAt: !i.checked ? Date.now() : null } : i
    ));
  },

  updateItem: async (id, changes) => {
    const items = await load(KEYS.SHOPPING_ITEMS);
    await save(KEYS.SHOPPING_ITEMS, items.map(i => i.id === id ? { ...i, ...changes } : i));
  },

  deleteItem: async (id) => {
    const items = await load(KEYS.SHOPPING_ITEMS);
    await save(KEYS.SHOPPING_ITEMS, items.filter(i => i.id !== id));
  },

  clearChecked: async (listId) => {
    const items = await load(KEYS.SHOPPING_ITEMS);
    const updated = items.filter(i => !(i.listId === listId && i.checked));
    await save(KEYS.SHOPPING_ITEMS, updated);
    return updated.filter(i => i.listId === listId);
  },
};

// ─── Tasks ─────────────────────────────────────────────────────────────────
export const TaskStorage = {
  getAll: () => load(KEYS.TASKS),

  add: async (title, priority = 'medium', dueDate = null, notes = '', tags = []) => {
    const items = await load(KEYS.TASKS);
    const item = { id: genId(), title, priority, dueDate, notes, tags, done: false, createdAt: Date.now() };
    await save(KEYS.TASKS, [item, ...items]);
    return item;
  },

  toggle: async (id) => {
    const items = await load(KEYS.TASKS);
    await save(KEYS.TASKS, items.map(i =>
      i.id === id ? { ...i, done: !i.done, doneAt: !i.done ? Date.now() : null } : i
    ));
  },

  update: async (id, changes) => {
    const items = await load(KEYS.TASKS);
    await save(KEYS.TASKS, items.map(i => i.id === id ? { ...i, ...changes } : i));
  },

  remove: async (id) => {
    const items = await load(KEYS.TASKS);
    await save(KEYS.TASKS, items.filter(i => i.id !== id));
  },

  clearDone: async () => {
    const items = await load(KEYS.TASKS);
    await save(KEYS.TASKS, items.filter(i => !i.done));
  },
};

// ─── Calendar Events ───────────────────────────────────────────────────────
export const EventStorage = {
  getAll: () => load(KEYS.EVENTS),

  add: async (title, date, time = null, color = '#5B6AF0', notes = '') => {
    const items = await load(KEYS.EVENTS);
    const item = { id: genId(), title, date, time, color, notes, createdAt: Date.now() };
    await save(KEYS.EVENTS, [item, ...items]);
    return item;
  },

  remove: async (id) => {
    const items = await load(KEYS.EVENTS);
    await save(KEYS.EVENTS, items.filter(i => i.id !== id));
  },

  update: async (id, changes) => {
    const items = await load(KEYS.EVENTS);
    await save(KEYS.EVENTS, items.map(i => i.id === id ? { ...i, ...changes } : i));
  },

  getForMonth: async (year, month) => {
    const items = await load(KEYS.EVENTS);
    return items.filter(e => {
      const d = new Date(e.date);
      return d.getFullYear() === year && d.getMonth() === month;
    });
  },
};

// ─── Budget ────────────────────────────────────────────────────────────────
export const BudgetStorage = {
  getAll: () => load(KEYS.EXPENSES),

  add: async (description, amount, category = 'Other', type = 'expense', date = new Date().toISOString().split('T')[0]) => {
    const items = await load(KEYS.EXPENSES);
    const item = { id: genId(), description, amount: parseFloat(amount), category, type, date, createdAt: Date.now() };
    await save(KEYS.EXPENSES, [item, ...items]);
    return item;
  },

  remove: async (id) => {
    const items = await load(KEYS.EXPENSES);
    await save(KEYS.EXPENSES, items.filter(i => i.id !== id));
  },

  getForMonth: async (year, month) => {
    const items = await load(KEYS.EXPENSES);
    return items.filter(e => {
      const d = new Date(e.date);
      return d.getFullYear() === year && d.getMonth() === month;
    });
  },
};

// ─── Settings ──────────────────────────────────────────────────────────────
export const SettingsStorage = {
  get: async () => {
    try {
      const raw = await AsyncStorage.getItem(KEYS.SETTINGS);
      return raw ? JSON.parse(raw) : { currency: 'USD', name: '', monthlyBudget: 0 };
    } catch { return { currency: 'USD', name: '', monthlyBudget: 0 }; }
  },
  save: async (s) => AsyncStorage.setItem(KEYS.SETTINGS, JSON.stringify(s)),
};
