const {
  getAlbumItems,
  getAnniversaries,
  getLifeTasks,
  getMoodCheckins,
  getProfile,
  saveAlbumItems,
  saveAnniversaries,
  saveBlindVotes,
  saveCoupleMembers,
  saveCoupleProfiles,
  saveCouponExchanges,
  saveCoupons,
  saveDishes,
  saveLedger,
  saveLedgerQuickActions,
  saveLifeTasks,
  saveMoodCheckins,
  saveWallets
} = require("./storage");

const CLOUD_FUNCTION_NAME = "orderService";
const DUAL_WALLET_ERROR = "云函数还是旧版单钱包，请重新部署 orderService";

function hasCloudSupport() {
  return Boolean(wx.cloud && wx.cloud.callFunction);
}

function getActiveProfile() {
  return getProfile();
}

function assertCloudReady() {
  const profile = getActiveProfile();

  if (!profile || !profile.coupleCode) {
    throw new Error("请先选择角色并填写绑定码");
  }

  if (!hasCloudSupport()) {
    throw new Error("当前环境还没有开启微信云开发");
  }

  return profile;
}

async function callCloudData(action, data = {}) {
  const profile = assertCloudReady();
  const response = await wx.cloud.callFunction({
    name: CLOUD_FUNCTION_NAME,
    data: {
      action,
      coupleCode: profile.coupleCode,
      actorRole: profile.role,
      actorName: profile.nickname,
      ...data
    }
  });
  const result = response && response.result ? response.result : {};

  if (!result.ok) {
    throw new Error(result.message || "云端同步失败");
  }

  return result;
}

async function saveCloudProfile(profile) {
  if (!profile || !profile.coupleCode) {
    throw new Error("请先填写绑定码");
  }

  if (!hasCloudSupport()) {
    throw new Error("当前环境还没有开启微信云开发");
  }

  const response = await wx.cloud.callFunction({
    name: CLOUD_FUNCTION_NAME,
    data: {
      action: "saveUserProfile",
      coupleCode: profile.coupleCode,
      actorRole: profile.role,
      actorName: profile.nickname,
      profile
    }
  });
  const result = response && response.result ? response.result : {};

  if (!result.ok) {
    throw new Error(result.message || "绑定失败");
  }

  saveCloudMembers(result.couple && result.couple.members);

  return result;
}

function normalizeCloudList(list) {
  return Array.isArray(list) ? list : [];
}

function saveCloudMembers(members) {
  if (Array.isArray(members)) {
    saveCoupleMembers(members);
  }
}

function normalizeWallet(wallet) {
  return {
    balance: 0,
    totalEarned: 0,
    totalSpent: 0,
    totalPenalty: 0,
    updatedAt: "",
    ...(wallet || {})
  };
}

function normalizeWallets(wallets, fallbackWallet) {
  if (wallets) {
    return {
      owner: normalizeWallet(wallets.owner),
      customer: normalizeWallet(wallets.customer)
    };
  }

  const profile = getActiveProfile();
  const role = profile && profile.role === "owner" ? "owner" : "customer";

  return {
    owner: normalizeWallet(),
    customer: normalizeWallet(),
    [role]: normalizeWallet(fallbackWallet)
  };
}

function assertDualWalletResult(result) {
  if (!result || !result.wallets) {
    throw new Error(DUAL_WALLET_ERROR);
  }
}

function mergeCloudItemIntoStorage(items, nextItem) {
  const exists = items.some((item) => item.id === nextItem.id);

  if (!exists) {
    return items.concat(nextItem);
  }

  return items.map((item) => (item.id === nextItem.id ? nextItem : item));
}

function hasCloudFilePath(value) {
  return typeof value === "string" && value.indexOf("cloud://") === 0;
}

function mergeLocalPendingAlbumItems(cloudItems) {
  const cloudIds = new Set(cloudItems.map((item) => item.id));
  const pendingItems = getAlbumItems().filter((item) => {
    const imagePath = item && (item.cloudFileId || item.imagePath);

    return item && item.id && !cloudIds.has(item.id) && !hasCloudFilePath(imagePath);
  });

  return cloudItems.concat(pendingItems);
}

function getFileExtension(path) {
  const match = String(path || "").match(/\.([a-zA-Z0-9]+)(?:\?|$)/);

  return match ? match[1].toLowerCase() : "jpg";
}

function normalizeCloudPathSegment(value, fallback) {
  return String(value || fallback || "member")
    .trim()
    .replace(/\s+/g, "")
    .replace(/[^a-zA-Z0-9_-]/g, "")
    .slice(0, 48) || fallback;
}

async function uploadCloudImage(localPath, folder = "album") {
  assertCloudReady();

  if (!localPath || hasCloudFilePath(localPath)) {
    return localPath;
  }

  const ext = getFileExtension(localPath);
  const response = await wx.cloud.uploadFile({
    cloudPath: `${folder}/${Date.now()}_${Math.floor(Math.random() * 100000)}.${ext}`,
    filePath: localPath
  });

  return response.fileID;
}

async function uploadCloudAvatar(localPath, coupleCode, role) {
  if (!localPath || hasCloudFilePath(localPath)) {
    return localPath;
  }

  if (!hasCloudSupport()) {
    throw new Error("当前环境还没有开启微信云开发");
  }

  const code = normalizeCloudPathSegment(coupleCode, "couple");
  const roleName = normalizeCloudPathSegment(role, "member");
  const ext = getFileExtension(localPath);
  const response = await wx.cloud.uploadFile({
    cloudPath: `avatars/${code}/${roleName}_${Date.now()}_${Math.floor(Math.random() * 100000)}.${ext}`,
    filePath: localPath
  });

  return response.fileID;
}

async function syncCloudDishes() {
  const result = await callCloudData("listDishes");
  const dishes = normalizeCloudList(result.dishes);

  saveDishes(dishes);
  return dishes;
}

async function saveCloudDish(dish) {
  const result = await callCloudData("saveDish", {
    dish
  });

  return result.dish;
}

async function deleteCloudDish(dishId) {
  const result = await callCloudData("deleteDish", {
    dishId
  });

  return result.dishId;
}

async function syncCloudCoupons() {
  const result = await callCloudData("listCoupons");
  const coupons = normalizeCloudList(result.coupons);

  saveCoupons(coupons);
  return coupons;
}

async function saveCloudCoupon(coupon) {
  const result = await callCloudData("saveCoupon", {
    coupon
  });

  return result.coupon;
}

async function deleteCloudCoupon(couponId) {
  const result = await callCloudData("deleteCoupon", {
    couponId
  });

  return result.couponId;
}

async function syncCloudWalletBundle() {
  const result = await callCloudData("getWalletBundle");
  assertDualWalletResult(result);

  const wallets = normalizeWallets(result.wallets);
  const profile = getActiveProfile();
  const role = profile && profile.role === "owner" ? "owner" : "customer";
  const wallet = normalizeWallet(wallets[role]);
  const ledger = normalizeCloudList(result.ledger);
  const couponExchanges = normalizeCloudList(result.couponExchanges);
  const ledgerQuickActions = result.ledgerQuickActions || {
    earn: [],
    deduct: []
  };

  saveWallets(wallets);
  saveCloudMembers(result.members);
  saveLedger(ledger);
  saveCouponExchanges(couponExchanges);
  saveLedgerQuickActions(ledgerQuickActions);

  return {
    wallets,
    wallet,
    ledger,
    couponExchanges,
    ledgerQuickActions
  };
}

async function applyCloudLedgerChange(record) {
  await syncCloudWalletBundle();

  const result = await callCloudData("applyLedgerChange", {
    record
  });

  await syncCloudWalletBundle();
  return result;
}

async function saveCloudLedgerQuickActions(ledgerQuickActions) {
  const result = await callCloudData("saveLedgerQuickActions", {
    ledgerQuickActions
  });

  saveLedgerQuickActions(result.ledgerQuickActions);
  return result.ledgerQuickActions;
}

async function exchangeCloudCoupon(couponId) {
  await syncCloudWalletBundle();

  const result = await callCloudData("exchangeCoupon", {
    couponId
  });

  await syncCloudCoupons();
  await syncCloudWalletBundle();
  return result;
}

async function syncCloudBlindVotes() {
  const result = await callCloudData("listBlindVotes");
  const blindVotes = normalizeCloudList(result.blindVotes);

  saveCloudMembers(result.members);
  saveBlindVotes(blindVotes);
  return blindVotes;
}

async function saveCloudBlindVote(blindVote) {
  const result = await callCloudData("saveBlindVote", {
    blindVote
  });

  return result.blindVote;
}

async function deleteCloudBlindVote(blindVoteId) {
  const result = await callCloudData("deleteBlindVote", {
    blindVoteId
  });

  return result.blindVoteId;
}

async function syncCloudAlbumItems() {
  const result = await callCloudData("listAlbumItems");
  const albumItems = mergeLocalPendingAlbumItems(normalizeCloudList(result.albumItems));

  saveCloudMembers(result.members);
  saveAlbumItems(albumItems);
  return albumItems;
}

async function saveCloudAlbumItem(albumItem) {
  const result = await callCloudData("saveAlbumItem", {
    albumItem
  });

  saveAlbumItems(mergeCloudItemIntoStorage(getAlbumItems(), result.albumItem));
  return result.albumItem;
}

async function deleteCloudAlbumItem(albumItemId) {
  const result = await callCloudData("deleteAlbumItem", {
    albumItemId
  });

  return result.albumItemId;
}

async function syncCloudAnniversaries() {
  const result = await callCloudData("listAnniversaries");
  const anniversaries = normalizeCloudList(result.anniversaries);

  saveAnniversaries(anniversaries);
  return anniversaries;
}

async function saveCloudAnniversary(anniversary) {
  const result = await callCloudData("saveAnniversary", {
    anniversary
  });

  saveAnniversaries(mergeCloudItemIntoStorage(getAnniversaries(), result.anniversary));
  return result.anniversary;
}

async function deleteCloudAnniversary(anniversaryId) {
  const result = await callCloudData("deleteAnniversary", {
    anniversaryId
  });

  return result.anniversaryId;
}

async function syncCloudMoodCheckins() {
  const result = await callCloudData("listMoodCheckins");
  const moodCheckins = normalizeCloudList(result.moodCheckins);

  saveCloudMembers(result.members);
  saveMoodCheckins(moodCheckins);
  return moodCheckins;
}

async function saveCloudMoodCheckin(moodCheckin) {
  const result = await callCloudData("saveMoodCheckin", {
    moodCheckin
  });

  saveMoodCheckins(mergeCloudItemIntoStorage(getMoodCheckins(), result.moodCheckin));
  return result.moodCheckin;
}

async function syncCloudLifeTasks() {
  const result = await callCloudData("listLifeTasks");
  const lifeTasks = normalizeCloudList(result.lifeTasks);

  saveCloudMembers(result.members);
  saveLifeTasks(lifeTasks);
  return lifeTasks;
}

async function saveCloudLifeTask(lifeTask) {
  const result = await callCloudData("saveLifeTask", {
    lifeTask
  });

  saveLifeTasks(mergeCloudItemIntoStorage(getLifeTasks(), result.lifeTask));
  return result.lifeTask;
}

async function deleteCloudLifeTask(lifeTaskId) {
  const result = await callCloudData("deleteLifeTask", {
    lifeTaskId
  });

  return result.lifeTaskId;
}

async function syncCloudCoupleProfiles() {
  const result = await callCloudData("getCoupleProfiles");
  const coupleProfiles = result.coupleProfiles || {
    me: {},
    partner: {}
  };

  saveCloudMembers(result.members);
  saveCoupleProfiles(coupleProfiles);
  return coupleProfiles;
}

async function saveCloudCoupleProfiles(coupleProfiles) {
  const result = await callCloudData("saveCoupleProfiles", {
    coupleProfiles
  });

  saveCoupleProfiles(result.coupleProfiles);
  return result.coupleProfiles;
}

async function syncCloudLifeBundle() {
  const result = await callCloudData("getLifeBundle");
  const albumItems = mergeLocalPendingAlbumItems(normalizeCloudList(result.albumItems));
  const anniversaries = normalizeCloudList(result.anniversaries);
  const moodCheckins = normalizeCloudList(result.moodCheckins);
  const lifeTasks = normalizeCloudList(result.lifeTasks);
  const coupleProfiles = result.coupleProfiles || {
    me: {},
    partner: {}
  };

  saveCloudMembers(result.members);
  saveAlbumItems(albumItems);
  saveAnniversaries(anniversaries);
  saveMoodCheckins(moodCheckins);
  saveLifeTasks(lifeTasks);
  saveCoupleProfiles(coupleProfiles);

  return {
    albumItems,
    anniversaries,
    moodCheckins,
    lifeTasks,
    coupleProfiles
  };
}

module.exports = {
  hasCloudSupport,
  getActiveProfile,
  uploadCloudImage,
  uploadCloudAvatar,
  saveCloudProfile,
  syncCloudDishes,
  saveCloudDish,
  deleteCloudDish,
  syncCloudCoupons,
  saveCloudCoupon,
  deleteCloudCoupon,
  syncCloudWalletBundle,
  applyCloudLedgerChange,
  saveCloudLedgerQuickActions,
  exchangeCloudCoupon,
  syncCloudBlindVotes,
  saveCloudBlindVote,
  deleteCloudBlindVote,
  syncCloudAlbumItems,
  saveCloudAlbumItem,
  deleteCloudAlbumItem,
  syncCloudAnniversaries,
  saveCloudAnniversary,
  deleteCloudAnniversary,
  syncCloudMoodCheckins,
  saveCloudMoodCheckin,
  syncCloudLifeTasks,
  saveCloudLifeTask,
  deleteCloudLifeTask,
  syncCloudCoupleProfiles,
  saveCloudCoupleProfiles,
  syncCloudLifeBundle
};
