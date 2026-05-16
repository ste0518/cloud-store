const STORAGE_KEYS = {
  dishes: "sweet_order_dishes",
  cart: "sweet_order_cart",
  orders: "sweet_order_orders",
  coupons: "sweet_order_coupons",
  couponExchanges: "sweet_order_coupon_exchanges",
  wallet: "sweet_order_wallet",
  ledger: "sweet_order_ledger",
  ledgerQuickActions: "sweet_order_ledger_quick_actions",
  remedyTasks: "sweet_order_remedy_tasks",
  blindVotes: "sweet_order_blind_votes",
  albumItems: "sweet_order_album_items",
  anniversaries: "sweet_order_anniversaries",
  moodCheckins: "sweet_order_mood_checkins",
  lifeTasks: "sweet_order_life_tasks",
  coupleProfiles: "sweet_order_couple_profiles",
  coupleMembers: "sweet_order_couple_members",
  profile: "sweet_order_profile"
};

const DEFAULT_DISHES = [];

const DEFAULT_COUPONS = [];

const DEFAULT_REMEDY_TASKS = [];

const DEFAULT_WALLET = {
  balance: 0,
  totalEarned: 0,
  totalSpent: 0,
  totalPenalty: 0,
  updatedAt: ""
};

const DEFAULT_WALLETS = {
  owner: DEFAULT_WALLET,
  customer: DEFAULT_WALLET
};

const DEFAULT_LEDGER_QUICK_ACTIONS = {
  earn: [],
  deduct: []
};

const DEFAULT_PROFILE = null;

const LEGACY_DEFAULT_COUPON_IDS = [
  "coupon_001",
  "coupon_002",
  "coupon_003",
  "coupon_004"
];

const LEGACY_DEFAULT_REMEDY_TASK_IDS = [
  "remedy_001",
  "remedy_002",
  "remedy_003",
  "remedy_004"
];

const DEFAULT_DATA = {
  [STORAGE_KEYS.dishes]: DEFAULT_DISHES,
  [STORAGE_KEYS.cart]: [],
  [STORAGE_KEYS.orders]: [],
  [STORAGE_KEYS.coupons]: DEFAULT_COUPONS,
  [STORAGE_KEYS.couponExchanges]: [],
  [STORAGE_KEYS.wallet]: DEFAULT_WALLETS,
  [STORAGE_KEYS.ledger]: [],
  [STORAGE_KEYS.ledgerQuickActions]: DEFAULT_LEDGER_QUICK_ACTIONS,
  [STORAGE_KEYS.remedyTasks]: DEFAULT_REMEDY_TASKS,
  [STORAGE_KEYS.blindVotes]: [],
  [STORAGE_KEYS.albumItems]: [],
  [STORAGE_KEYS.anniversaries]: [],
  [STORAGE_KEYS.moodCheckins]: [],
  [STORAGE_KEYS.lifeTasks]: [],
  [STORAGE_KEYS.coupleProfiles]: {
    me: {},
    partner: {}
  },
  [STORAGE_KEYS.coupleMembers]: [],
  [STORAGE_KEYS.profile]: DEFAULT_PROFILE
};

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function normalizeRole(role) {
  return role === "owner" ? "owner" : "customer";
}

function getActiveRole() {
  const profile = wx.getStorageSync(STORAGE_KEYS.profile);

  return normalizeRole(profile && profile.role);
}

function normalizeWallet(wallet) {
  return {
    ...clone(DEFAULT_WALLET),
    ...(wallet || {})
  };
}

function isWalletsValue(value) {
  return Boolean(value && typeof value === "object" && (value.owner || value.customer));
}

function normalizeWallets(value) {
  if (isWalletsValue(value)) {
    return {
      owner: normalizeWallet(value.owner),
      customer: normalizeWallet(value.customer)
    };
  }

  return {
    ...clone(DEFAULT_WALLETS),
    [getActiveRole()]: normalizeWallet(value)
  };
}

function isEmptyStorageValue(value) {
  return value === "" || value === undefined || value === null;
}

function normalizeScopeCode(value) {
  return String(value || "").trim().replace(/\s+/g, "").toUpperCase();
}

function getActiveScopeCode() {
  const profile = wx.getStorageSync(STORAGE_KEYS.profile);

  return profile && profile.coupleCode ? normalizeScopeCode(profile.coupleCode) : "";
}

function getStorageKey(key) {
  const scopeCode = key === STORAGE_KEYS.profile ? "" : getActiveScopeCode();

  return scopeCode ? `${key}__${scopeCode}` : key;
}

function isEmptyArrayStorage(key) {
  const value = wx.getStorageSync(getStorageKey(key));
  return isEmptyStorageValue(value) || (Array.isArray(value) && value.length === 0);
}

function hasNoWalletActivity() {
  return (
    isEmptyArrayStorage(STORAGE_KEYS.ledger) &&
    isEmptyArrayStorage(STORAGE_KEYS.orders) &&
    isEmptyArrayStorage(STORAGE_KEYS.couponExchanges)
  );
}

function hasOnlyIds(items, ids) {
  if (!Array.isArray(items) || items.length !== ids.length) {
    return false;
  }

  return items.every((item) => ids.includes(item.id));
}

function isLegacyDefaultWallet(value) {
  return (
    value &&
    value.balance === 30 &&
    value.totalEarned === 30 &&
    value.totalSpent === 0 &&
    value.totalPenalty === 0 &&
    !value.updatedAt
  );
}

function migrateLegacyDefaultValue(key, value) {
  if (key === STORAGE_KEYS.wallet && isLegacyDefaultWallet(value) && hasNoWalletActivity()) {
    return clone(DEFAULT_WALLET);
  }

  if (key === STORAGE_KEYS.coupons && hasOnlyIds(value, LEGACY_DEFAULT_COUPON_IDS)) {
    return clone(DEFAULT_COUPONS);
  }

  if (key === STORAGE_KEYS.remedyTasks && hasOnlyIds(value, LEGACY_DEFAULT_REMEDY_TASK_IDS)) {
    return clone(DEFAULT_REMEDY_TASKS);
  }

  return value;
}

function getData(key) {
  const storageKey = getStorageKey(key);
  const value = wx.getStorageSync(storageKey);

  if (isEmptyStorageValue(value)) {
    const defaultValue = clone(DEFAULT_DATA[key]);
    wx.setStorageSync(storageKey, defaultValue);
    return defaultValue;
  }

  const migratedValue = migrateLegacyDefaultValue(key, value);

  if (key === STORAGE_KEYS.wallet) {
    const wallets = normalizeWallets(migratedValue);

    if (JSON.stringify(wallets) !== JSON.stringify(value)) {
      wx.setStorageSync(storageKey, wallets);
    }

    return wallets;
  }

  if (migratedValue !== value) {
    wx.setStorageSync(storageKey, migratedValue);
  }

  return migratedValue;
}

function saveData(key, value) {
  wx.setStorageSync(getStorageKey(key), value);
  return value;
}

function getDishes() {
  return getData(STORAGE_KEYS.dishes);
}

function saveDishes(dishes) {
  return saveData(STORAGE_KEYS.dishes, dishes);
}

function getCart() {
  return getData(STORAGE_KEYS.cart);
}

function saveCart(cart) {
  return saveData(STORAGE_KEYS.cart, cart);
}

function getOrders() {
  return getData(STORAGE_KEYS.orders);
}

function saveOrders(orders) {
  return saveData(STORAGE_KEYS.orders, orders);
}

function getCoupons() {
  return getData(STORAGE_KEYS.coupons);
}

function saveCoupons(coupons) {
  return saveData(STORAGE_KEYS.coupons, coupons);
}

function getCouponExchanges() {
  return getData(STORAGE_KEYS.couponExchanges);
}

function saveCouponExchanges(exchanges) {
  return saveData(STORAGE_KEYS.couponExchanges, exchanges);
}

function getWallet() {
  return getWallets()[getActiveRole()];
}

function saveWallet(wallet, role) {
  const targetRole = normalizeRole(role || getActiveRole());
  const wallets = getWallets();
  const nextWallets = {
    ...wallets,
    [targetRole]: normalizeWallet(wallet)
  };

  saveWallets(nextWallets);
  return nextWallets[targetRole];
}

function getWallets() {
  return normalizeWallets(getData(STORAGE_KEYS.wallet));
}

function saveWallets(wallets) {
  return saveData(STORAGE_KEYS.wallet, normalizeWallets(wallets));
}

function getLedger() {
  return getData(STORAGE_KEYS.ledger);
}

function saveLedger(ledger) {
  return saveData(STORAGE_KEYS.ledger, ledger);
}

function getLedgerQuickActions() {
  return getData(STORAGE_KEYS.ledgerQuickActions);
}

function saveLedgerQuickActions(actions) {
  return saveData(STORAGE_KEYS.ledgerQuickActions, actions);
}

function getRemedyTasks() {
  return getData(STORAGE_KEYS.remedyTasks);
}

function saveRemedyTasks(tasks) {
  return saveData(STORAGE_KEYS.remedyTasks, tasks);
}

function getBlindVotes() {
  return getData(STORAGE_KEYS.blindVotes);
}

function saveBlindVotes(votes) {
  return saveData(STORAGE_KEYS.blindVotes, votes);
}

function getAlbumItems() {
  return getData(STORAGE_KEYS.albumItems);
}

function saveAlbumItems(items) {
  return saveData(STORAGE_KEYS.albumItems, items);
}

function getAnniversaries() {
  return getData(STORAGE_KEYS.anniversaries);
}

function saveAnniversaries(items) {
  return saveData(STORAGE_KEYS.anniversaries, items);
}

function getMoodCheckins() {
  return getData(STORAGE_KEYS.moodCheckins);
}

function saveMoodCheckins(items) {
  return saveData(STORAGE_KEYS.moodCheckins, items);
}

function getLifeTasks() {
  return getData(STORAGE_KEYS.lifeTasks);
}

function saveLifeTasks(items) {
  return saveData(STORAGE_KEYS.lifeTasks, items);
}

function getCoupleProfiles() {
  return getData(STORAGE_KEYS.coupleProfiles);
}

function saveCoupleProfiles(value) {
  return saveData(STORAGE_KEYS.coupleProfiles, value);
}

function getCoupleMembers() {
  return getData(STORAGE_KEYS.coupleMembers);
}

function saveCoupleMembers(value) {
  return saveData(STORAGE_KEYS.coupleMembers, Array.isArray(value) ? value : []);
}

function getProfile() {
  return getData(STORAGE_KEYS.profile);
}

function getNicknameByRole(role) {
  const targetRole = normalizeRole(role);
  const profile = getProfile();

  if (profile && normalizeRole(profile.role) === targetRole && profile.nickname) {
    return profile.nickname;
  }

  const member = getCoupleMembers().find((item) => normalizeRole(item.role) === targetRole);

  return member && member.nickname ? member.nickname : "";
}

function getPartnerNickname() {
  const profile = getProfile();
  const ownRole = normalizeRole(profile && profile.role);
  const partnerRole = ownRole === "owner" ? "customer" : "owner";

  return getNicknameByRole(partnerRole) || "对方";
}

function getDisplayName(value, fallback = "我") {
  if (value === "老板") {
    return getNicknameByRole("owner") || fallback;
  }

  if (value === "顾客") {
    return getNicknameByRole("customer") || fallback;
  }

  if (value === "对方") {
    return getPartnerNickname();
  }

  return value || fallback;
}

function saveProfile(profile) {
  return saveData(STORAGE_KEYS.profile, profile);
}

function clearProfile() {
  wx.removeStorageSync(STORAGE_KEYS.profile);
}

function resetAllData() {
  Object.keys(DEFAULT_DATA).forEach((key) => {
    const storageKey = getStorageKey(key);

    wx.setStorageSync(storageKey, clone(DEFAULT_DATA[key]));

    if (storageKey !== key) {
      wx.removeStorageSync(key);
    }
  });
}

module.exports = {
  STORAGE_KEYS,
  DEFAULT_DISHES,
  DEFAULT_COUPONS,
  DEFAULT_REMEDY_TASKS,
  DEFAULT_WALLET,
  DEFAULT_WALLETS,
  DEFAULT_LEDGER_QUICK_ACTIONS,
  DEFAULT_PROFILE,
  getDishes,
  saveDishes,
  getCart,
  saveCart,
  getOrders,
  saveOrders,
  getCoupons,
  saveCoupons,
  getCouponExchanges,
  saveCouponExchanges,
  getWallet,
  saveWallet,
  getWallets,
  saveWallets,
  getLedger,
  saveLedger,
  getLedgerQuickActions,
  saveLedgerQuickActions,
  getRemedyTasks,
  saveRemedyTasks,
  getBlindVotes,
  saveBlindVotes,
  getAlbumItems,
  saveAlbumItems,
  getAnniversaries,
  saveAnniversaries,
  getMoodCheckins,
  saveMoodCheckins,
  getLifeTasks,
  saveLifeTasks,
  getCoupleProfiles,
  saveCoupleProfiles,
  getCoupleMembers,
  saveCoupleMembers,
  getNicknameByRole,
  getPartnerNickname,
  getDisplayName,
  getProfile,
  saveProfile,
  clearProfile,
  resetAllData
};
