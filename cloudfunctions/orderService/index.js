const cloud = require("wx-server-sdk");

cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV
});

const db = cloud.database();
const _ = db.command;

const COLLECTIONS = {
  orders: "orders",
  dishes: "dishes",
  coupons: "coupons",
  couponExchanges: "couponExchanges",
  wallets: "wallets",
  ledger: "ledger",
  couples: "couples",
  users: "users",
  blindVotes: "blindVotes",
  albumItems: "albumItems",
  anniversaries: "anniversaries",
  moodCheckins: "moodCheckins",
  lifeTasks: "lifeTasks"
};

const VALID_STATUS = ["pending", "accepted", "completed", "cancelled"];
const LEDGER_TYPES = ["earn", "deduct", "spend", "remedy"];

const DEFAULT_WALLET = {
  balance: 0,
  totalEarned: 0,
  totalSpent: 0,
  totalPenalty: 0,
  updatedAt: ""
};

function normalizeRole(role) {
  return role === "owner" ? "owner" : "customer";
}

function getCounterpartRole(role) {
  return normalizeRole(role) === "owner" ? "customer" : "owner";
}

function getRoleText(role) {
  return normalizeRole(role) === "owner" ? "老板" : "顾客";
}

const DEFAULT_LEDGER_QUICK_ACTIONS = {
  earn: [],
  deduct: []
};

function ok(data = {}) {
  return {
    ok: true,
    ...data
  };
}

function fail(message) {
  return {
    ok: false,
    message
  };
}

function cleanText(value, fallback = "") {
  if (typeof value !== "string") {
    return fallback;
  }

  return value.trim();
}

function normalizeCoupleCode(value) {
  return cleanText(value).replace(/\s+/g, "").toUpperCase();
}

function normalizeActor(event, wxContext) {
  return {
    openid: wxContext.OPENID,
    role: cleanText(event.actorRole, "unknown"),
    name: cleanText(event.actorName, "用户")
  };
}

function requireCoupleCode(event) {
  const coupleCode = normalizeCoupleCode(event.coupleCode);

  if (!coupleCode) {
    throw new Error("缺少绑定码");
  }

  return coupleCode;
}

function isLocalOrderId(value) {
  return typeof value === "string" && value.indexOf("order_") === 0;
}

function numberOrDefault(value, fallback = 0) {
  const number = Number(value);

  return Number.isFinite(number) ? number : fallback;
}

function stripCloudFields(item) {
  const { _id, _openid, ...rest } = item || {};

  return rest;
}

function compactUndefined(data) {
  Object.keys(data).forEach((key) => {
    if (data[key] === undefined) {
      delete data[key];
    }
  });

  return data;
}

function sortByLatest(items) {
  return items.slice().sort((a, b) => {
    const aTime = a.updatedAt || a.createdAt || 0;
    const bTime = b.updatedAt || b.createdAt || 0;

    return bTime - aTime;
  });
}

function normalizeMembers(couple) {
  return Array.isArray(couple && couple.members) ? couple.members.filter((member) => member && member.openid) : [];
}

function publicMembers(couple) {
  return normalizeMembers(couple).map((member) => ({
    role: cleanText(member.role),
    roleText: cleanText(member.roleText),
    nickname: cleanText(member.nickname, member.roleText || "用户"),
    avatarUrl: cleanText(member.avatarUrl)
  }));
}

function findMemberIndex(couple, openid) {
  return normalizeMembers(couple).findIndex((member) => member.openid === openid);
}

function buildMember(actor, profile, now, existing = {}) {
  return {
    ...existing,
    openid: actor.openid,
    role: cleanText(profile.role || actor.role, "customer"),
    roleText: cleanText(profile.roleText || (profile.role === "owner" ? "老板" : "顾客")),
    nickname: cleanText(profile.nickname || actor.name, "用户"),
    avatarUrl: cleanText(profile.avatarUrl || existing.avatarUrl),
    joinedAt: existing.joinedAt || now,
    updatedAt: now
  };
}

async function getCoupleDoc(coupleCode) {
  const result = await db
    .collection(COLLECTIONS.couples)
    .where({
      coupleCode
    })
    .limit(1)
    .get();

  return result.data[0] || null;
}

async function requireCoupleMember(event, wxContext) {
  const coupleCode = requireCoupleCode(event);
  const actor = normalizeActor(event, wxContext);
  const couple = await getCoupleDoc(coupleCode);

  if (!couple) {
    throw new Error("这个绑定码还没有创建，请先在角色入口保存身份");
  }

  if (findMemberIndex(couple, actor.openid) === -1) {
    throw new Error("你不是这个绑定码的成员，不能查看这份小铺记忆");
  }

  return {
    coupleCode,
    actor,
    couple
  };
}

async function seedMembersFromUsers(coupleCode, now) {
  const result = await db
    .collection(COLLECTIONS.users)
    .where({
      coupleCode
    })
    .limit(2)
    .get();

  return (result.data || []).map((user) => ({
    openid: user.openid,
    role: cleanText(user.role, "customer"),
    roleText: cleanText(user.roleText || (user.role === "owner" ? "老板" : "顾客")),
    nickname: cleanText(user.nickname, "用户"),
    avatarUrl: cleanText(user.avatarUrl),
    joinedAt: user.createdAt || user.updatedAt || now,
    updatedAt: user.updatedAt || now
  }));
}

function sanitizeSnapshots(itemsSnapshot) {
  if (!Array.isArray(itemsSnapshot)) {
    return [];
  }

  return itemsSnapshot.map((item) => ({
    id: cleanText(item.id),
    name: cleanText(item.name, "菜品"),
    icon: cleanText(item.icon, "🍽️"),
    description: cleanText(item.description),
    category: cleanText(item.category, "other")
  }));
}

function sanitizeDish(dish, coupleCode, actor, now) {
  const source = stripCloudFields(dish);

  return {
    ...source,
    id: cleanText(source.id, `dish_${now}`),
    coupleCode,
    name: cleanText(source.name, "未命名菜品"),
    icon: cleanText(source.icon, "🍽️"),
    category: cleanText(source.category, "other"),
    description: cleanText(source.description),
    difficulty: cleanText(source.difficulty, "easy"),
    estimatedMinutes: numberOrDefault(source.estimatedMinutes),
    tags: Array.isArray(source.tags) ? source.tags.map((tag) => cleanText(tag)).filter(Boolean) : [],
    availableToday: source.availableToday !== false,
    lastCookedAt: source.lastCookedAt || null,
    createdAt: numberOrDefault(source.createdAt, now),
    updatedAt: now,
    updatedByOpenid: actor.openid,
    updatedByRole: actor.role,
    updatedByName: actor.name
  };
}

function sanitizeCoupon(coupon, coupleCode, actor, now) {
  const source = stripCloudFields(coupon);

  return {
    ...source,
    id: cleanText(source.id, `coupon_${now}`),
    coupleCode,
    title: cleanText(source.title || source.name, "未命名奖券"),
    emoji: cleanText(source.emoji || source.icon, "🎟️"),
    description: cleanText(source.description),
    cost: Math.max(numberOrDefault(source.cost), 0),
    stock: Math.max(numberOrDefault(source.stock), 0),
    createdAt: numberOrDefault(source.createdAt, now),
    updatedAt: now,
    updatedByOpenid: actor.openid,
    updatedByRole: actor.role,
    updatedByName: actor.name
  };
}

function sanitizeVote(vote, coupleCode, actor, now) {
  const source = stripCloudFields(vote);
  const votes = source.votes || {};

  return {
    ...source,
    id: cleanText(source.id, `blind_${now}`),
    coupleCode,
    title: cleanText(source.title, "今晚吃什么？"),
    options: Array.isArray(source.options) ? source.options.map((item) => cleanText(item)).filter(Boolean) : [],
    votes: {
      personA: votes.personA ? cleanText(votes.personA) : null,
      personB: votes.personB ? cleanText(votes.personB) : null
    },
    revealed: Boolean(source.revealed),
    result: source.result ? cleanText(source.result) : null,
    createdAt: numberOrDefault(source.createdAt, now),
    updatedAt: now,
    updatedByOpenid: actor.openid,
    updatedByRole: actor.role,
    updatedByName: actor.name
  };
}

function sanitizeAlbumItem(item, coupleCode, actor, now) {
  const source = stripCloudFields(item);

  return {
    ...source,
    id: cleanText(source.id, `photo_${now}`),
    coupleCode,
    imagePath: cleanText(source.imagePath || source.cloudFileId || source.thumbFileId),
    cloudFileId: cleanText(source.cloudFileId),
    thumbFileId: cleanText(source.thumbFileId),
    syncStatus: cleanText(source.syncStatus, "ready"),
    date: cleanText(source.date),
    note: cleanText(source.note),
    location: cleanText(source.location),
    tag: cleanText(source.tag, "日常"),
    uploader: cleanText(source.uploader || actor.name, "我"),
    favorite: Boolean(source.favorite),
    isCover: Boolean(source.isCover),
    createdAt: numberOrDefault(source.createdAt, now),
    updatedAt: now,
    updatedByOpenid: actor.openid,
    updatedByRole: actor.role,
    updatedByName: actor.name
  };
}

function sanitizeAnniversary(item, coupleCode, actor, now) {
  const source = stripCloudFields(item);

  return {
    ...source,
    id: cleanText(source.id, `anniversary_${now}`),
    coupleCode,
    title: cleanText(source.title, "纪念日"),
    date: cleanText(source.date),
    type: cleanText(source.type, "love"),
    icon: cleanText(source.icon, "💗"),
    remark: cleanText(source.remark),
    createdAt: numberOrDefault(source.createdAt, now),
    updatedAt: now,
    updatedByOpenid: actor.openid,
    updatedByRole: actor.role,
    updatedByName: actor.name
  };
}

function sanitizeMoodCheckin(item, coupleCode, actor, now) {
  const source = stripCloudFields(item);

  return {
    ...source,
    id: cleanText(source.id, `mood_${now}`),
    coupleCode,
    date: cleanText(source.date),
    role: cleanText(source.role || actor.name, "我"),
    mood: cleanText(source.mood, "happy"),
    note: cleanText(source.note),
    createdAt: numberOrDefault(source.createdAt, now),
    updatedAt: now,
    updatedByOpenid: actor.openid,
    updatedByRole: actor.role,
    updatedByName: actor.name
  };
}

function sanitizeLifeTask(item, coupleCode, actor, now) {
  const source = stripCloudFields(item);

  return {
    ...source,
    id: cleanText(source.id, `life_task_${now}`),
    coupleCode,
    title: cleanText(source.title, "小任务"),
    type: cleanText(source.type, "home"),
    assignee: cleanText(source.assignee, "一起"),
    dueDate: cleanText(source.dueDate),
    reward: Math.max(numberOrDefault(source.reward), 0),
    done: Boolean(source.done),
    completedAt: source.completedAt || "",
    rewardGiven: Boolean(source.rewardGiven),
    createdAt: numberOrDefault(source.createdAt, now),
    updatedAt: now,
    updatedByOpenid: actor.openid,
    updatedByRole: actor.role,
    updatedByName: actor.name
  };
}

function sanitizeCoupleProfiles(value) {
  const emptyProfile = {
    name: "",
    likes: "",
    dislikes: "",
    drinks: "",
    surprises: "",
    comfort: "",
    avoid: "",
    dateIdeas: ""
  };
  const source = value || {};

  return {
    me: {
      ...emptyProfile,
      ...(source.me || {})
    },
    partner: {
      ...emptyProfile,
      ...(source.partner || {})
    }
  };
}

function sanitizeQuickAction(action, type, now) {
  return {
    id: cleanText(action.id, `quick_${type}_${now}`),
    type,
    amount: Math.max(numberOrDefault(action.amount), 0),
    reason: cleanText(action.reason),
    createdAt: numberOrDefault(action.createdAt, now)
  };
}

function sanitizeQuickActions(actions, now) {
  const source = actions || {};

  return {
    earn: Array.isArray(source.earn)
      ? source.earn.map((action) => sanitizeQuickAction(action, "earn", now)).filter((item) => item.amount && item.reason)
      : [],
    deduct: Array.isArray(source.deduct)
      ? source.deduct.map((action) => sanitizeQuickAction(action, "deduct", now)).filter((item) => item.amount && item.reason)
      : []
  };
}

async function queryByCouple(collectionName, coupleCode, limit = 100) {
  const result = await db
    .collection(collectionName)
    .where({
      coupleCode
    })
    .limit(limit)
    .get();

  return result.data || [];
}

async function getByBusinessId(collectionName, coupleCode, id) {
  const result = await db
    .collection(collectionName)
    .where({
      coupleCode,
      id
    })
    .limit(1)
    .get();

  return result.data[0] || null;
}

async function upsertByBusinessId(collectionName, coupleCode, source, actor, sanitizer) {
  const now = Date.now();
  const data = sanitizer(source, coupleCode, actor, now);
  const existing = await getByBusinessId(collectionName, coupleCode, data.id);

  if (existing) {
    await db.collection(collectionName).doc(existing._id).update({
      data
    });

    return {
      _id: existing._id,
      ...existing,
      ...data
    };
  }

  const addResult = await db.collection(collectionName).add({
    data
  });

  return {
    _id: addResult._id,
    ...data
  };
}

async function removeByBusinessId(collectionName, coupleCode, id) {
  const target = await getByBusinessId(collectionName, coupleCode, id);

  if (!target) {
    return null;
  }

  await db.collection(collectionName).doc(target._id).remove();

  return target;
}

async function ensureCoupleDoc(coupleCode) {
  const now = Date.now();
  const couple = await getCoupleDoc(coupleCode);

  if (couple) {
    return couple;
  }

  const data = {
    coupleCode,
    members: [],
    locked: false,
    ledgerQuickActions: DEFAULT_LEDGER_QUICK_ACTIONS,
    createdAt: now,
    updatedAt: now
  };
  const addResult = await db.collection(COLLECTIONS.couples).add({
    data
  });

  return {
    _id: addResult._id,
    ...data
  };
}

async function ensureWalletDoc(coupleCode) {
  return ensureRoleWalletDoc(coupleCode, "customer");
}

async function listWalletDocs(coupleCode) {
  const result = await db
    .collection(COLLECTIONS.wallets)
    .where({
      coupleCode
    })
    .limit(10)
    .get();

  return result.data || [];
}

function normalizeWalletDoc(wallet, role) {
  return {
    ...DEFAULT_WALLET,
    ...(wallet || {}),
    role: normalizeRole(role || (wallet && wallet.role)),
    roleText: getRoleText(role || (wallet && wallet.role))
  };
}

async function ensureRoleWalletDoc(coupleCode, role) {
  const now = Date.now();
  const targetRole = normalizeRole(role);
  const wallets = await listWalletDocs(coupleCode);
  const roleWallet = wallets.find((wallet) => wallet.role && normalizeRole(wallet.role) === targetRole);

  if (roleWallet) {
    return normalizeWalletDoc(roleWallet, targetRole);
  }

  const legacyWallet = wallets.find((wallet) => !wallet.role);

  if (legacyWallet) {
    const data = {
      role: targetRole,
      roleText: getRoleText(targetRole),
      updatedAt: now
    };

    await db.collection(COLLECTIONS.wallets).doc(legacyWallet._id).update({
      data
    });

    return normalizeWalletDoc({
      ...legacyWallet,
      ...data
    }, targetRole);
  }

  const data = {
    coupleCode,
    role: targetRole,
    roleText: getRoleText(targetRole),
    ...DEFAULT_WALLET,
    createdAt: now,
    updatedAt: now
  };
  const addResult = await db.collection(COLLECTIONS.wallets).add({
    data
  });

  return {
    _id: addResult._id,
    ...data
  };
}

async function ensureWalletDocs(coupleCode, preferredRole) {
  const firstRole = normalizeRole(preferredRole);
  const secondRole = getCounterpartRole(firstRole);
  const firstWallet = await ensureRoleWalletDoc(coupleCode, firstRole);
  const secondWallet = await ensureRoleWalletDoc(coupleCode, secondRole);

  return {
    [firstRole]: firstWallet,
    [secondRole]: secondWallet
  };
}

async function updateWalletByLedger(coupleCode, type, amount, now, targetRole) {
  const wallet = await ensureRoleWalletDoc(coupleCode, targetRole);
  const positive = type === "earn" || type === "remedy";
  const data = {
    balance: _.inc(positive ? amount : -amount),
    updatedAt: now
  };

  if (positive) {
    data.totalEarned = _.inc(amount);
  }

  if (type === "spend") {
    data.totalSpent = _.inc(amount);
  }

  if (type === "deduct") {
    data.totalPenalty = _.inc(amount);
  }

  await db.collection(COLLECTIONS.wallets).doc(wallet._id).update({
    data
  });

  const nextWallet = await db.collection(COLLECTIONS.wallets).doc(wallet._id).get();

  return nextWallet.data;
}

async function addLedgerRecord(coupleCode, payload, actor, now) {
  const type = cleanText(payload.type, "earn");
  const amount = Math.max(numberOrDefault(payload.amount), 0);
  const targetRole = normalizeRole(payload.targetRole || actor.role);

  if (!LEDGER_TYPES.includes(type)) {
    throw new Error("账本类型不正确");
  }

  if (!amount) {
    throw new Error("金额要是正数");
  }

  const record = compactUndefined({
    id: cleanText(payload.id, `ledger_${now}`),
    coupleCode,
    type,
    amount,
    reason: cleanText(payload.reason, "云朵币记录"),
    targetRole,
    targetRoleText: getRoleText(targetRole),
    orderId: payload.orderId ? cleanText(payload.orderId) : undefined,
    cloudOrderId: payload.cloudOrderId ? cleanText(payload.cloudOrderId) : undefined,
    couponId: payload.couponId ? cleanText(payload.couponId) : undefined,
    dishIds: Array.isArray(payload.dishIds) ? payload.dishIds.map((item) => cleanText(item)).filter(Boolean) : undefined,
    createdAt: numberOrDefault(payload.createdAt, now),
    createdByOpenid: actor.openid,
    createdByRole: actor.role,
    createdByName: actor.name
  });
  const addResult = await db.collection(COLLECTIONS.ledger).add({
    data: record
  });
  const wallet = await updateWalletByLedger(coupleCode, type, amount, now, targetRole);

  return {
    wallet,
    record: {
      _id: addResult._id,
      ...record
    }
  };
}

async function markDishesCooked(coupleCode, dishIds, now) {
  const ids = Array.isArray(dishIds) ? dishIds.map((id) => cleanText(id)).filter(Boolean) : [];

  await Promise.all(
    ids.map(async (id) => {
      const dish = await getByBusinessId(COLLECTIONS.dishes, coupleCode, id);

      if (!dish) {
        return;
      }

      await db.collection(COLLECTIONS.dishes).doc(dish._id).update({
        data: {
          lastCookedAt: now,
          updatedAt: now
        }
      });
    })
  );
}

function buildStatusUpdate(status, actor, now) {
  const updateData = {
    status,
    updatedAt: now,
    updatedByOpenid: actor.openid,
    updatedByRole: actor.role,
    updatedByName: actor.name
  };

  if (status === "accepted") {
    updateData.acceptedAt = now;
  }

  if (status === "completed") {
    updateData.completedAt = now;
  }

  if (status === "cancelled") {
    updateData.cancelledAt = now;
  }

  return updateData;
}

function canTransition(fromStatus, toStatus) {
  if (toStatus === "accepted") {
    return fromStatus === "pending";
  }

  if (toStatus === "completed") {
    return fromStatus === "accepted";
  }

  if (toStatus === "cancelled") {
    return fromStatus === "pending";
  }

  return false;
}

async function getOrderById(coupleCode, orderId, localId) {
  if (orderId && !isLocalOrderId(orderId)) {
    try {
      const docResult = await db.collection(COLLECTIONS.orders).doc(orderId).get();

      if (docResult.data && docResult.data.coupleCode === coupleCode) {
        return docResult.data;
      }
    } catch (error) {
      // Fall through to localId lookup.
    }
  }

  const queryResult = await db
    .collection(COLLECTIONS.orders)
    .where({
      coupleCode,
      localId: localId || orderId
    })
    .limit(1)
    .get();

  return queryResult.data[0] || null;
}

async function createOrder(event, wxContext) {
  const coupleCode = requireCoupleCode(event);
  const order = event.order || {};
  const now = Date.now();

  if (!Array.isArray(order.items) || order.items.length === 0) {
    return fail("订单里还没有菜品");
  }

  const localId = cleanText(order.localId || order.id, `order_${now}`);
  const data = {
    localId,
    id: localId,
    coupleCode,
    customerName: cleanText(order.customerName || event.actorName, "用户"),
    customerRole: cleanText(order.customerRole || event.actorRole, "customer"),
    customerOpenid: wxContext.OPENID,
    createdByOpenid: wxContext.OPENID,
    createdByRole: cleanText(event.actorRole, "customer"),
    createdByName: cleanText(event.actorName, "用户"),
    items: order.items.map((item) => cleanText(item)).filter(Boolean),
    itemsSnapshot: sanitizeSnapshots(order.itemsSnapshot),
    notes: cleanText(order.notes),
    status: "pending",
    createdAt: numberOrDefault(order.createdAt, now),
    updatedAt: now,
    acceptedAt: null,
    completedAt: null,
    cancelledAt: null
  };
  const addResult = await db.collection(COLLECTIONS.orders).add({
    data
  });
  const createdOrder = {
    _id: addResult._id,
    ...data
  };

  return ok({
    order: createdOrder
  });
}

async function listOrders(event) {
  const coupleCode = requireCoupleCode(event);
  const limit = Math.min(numberOrDefault(event.limit, 30), 100);
  const orders = await queryByCouple(COLLECTIONS.orders, coupleCode, 100);

  return ok({
    orders: sortByLatest(orders).slice(0, limit)
  });
}

async function updateOrderStatus(event, wxContext) {
  const coupleCode = requireCoupleCode(event);
  const status = cleanText(event.status);
  const now = Date.now();
  const actor = normalizeActor(event, wxContext);

  if (!VALID_STATUS.includes(status) || status === "pending") {
    return fail("订单状态不正确");
  }

  if ((status === "accepted" || status === "completed") && actor.role !== "owner") {
    return fail("当前身份不能处理订单");
  }

  const order = await getOrderById(coupleCode, cleanText(event.orderId), cleanText(event.localId));

  if (!order) {
    return fail("没有找到这张订单");
  }

  if (!canTransition(order.status, status)) {
    return fail("订单状态已经变化了");
  }

  await db
    .collection(COLLECTIONS.orders)
    .doc(order._id)
    .update({
      data: buildStatusUpdate(status, actor, now)
    });

  if (status === "completed") {
    await markDishesCooked(coupleCode, order.items, now);
  }

  const nextOrder = await db.collection(COLLECTIONS.orders).doc(order._id).get();

  return ok({
    order: nextOrder.data
  });
}

async function listDishes(event) {
  const coupleCode = requireCoupleCode(event);
  const dishes = await queryByCouple(COLLECTIONS.dishes, coupleCode, 100);

  return ok({
    dishes: sortByLatest(dishes)
  });
}

async function saveDish(event, wxContext) {
  const coupleCode = requireCoupleCode(event);
  const actor = normalizeActor(event, wxContext);
  const dish = await upsertByBusinessId(COLLECTIONS.dishes, coupleCode, event.dish || {}, actor, sanitizeDish);

  return ok({
    dish
  });
}

async function deleteDish(event) {
  const coupleCode = requireCoupleCode(event);
  const dishId = cleanText(event.dishId || event.id);

  if (!dishId) {
    return fail("缺少菜品 id");
  }

  await removeByBusinessId(COLLECTIONS.dishes, coupleCode, dishId);

  return ok({
    dishId
  });
}

async function listCoupons(event) {
  const coupleCode = requireCoupleCode(event);
  const coupons = await queryByCouple(COLLECTIONS.coupons, coupleCode, 100);

  return ok({
    coupons: sortByLatest(coupons)
  });
}

async function saveCoupon(event, wxContext) {
  const coupleCode = requireCoupleCode(event);
  const actor = normalizeActor(event, wxContext);
  const coupon = await upsertByBusinessId(COLLECTIONS.coupons, coupleCode, event.coupon || {}, actor, sanitizeCoupon);

  return ok({
    coupon
  });
}

async function deleteCoupon(event) {
  const coupleCode = requireCoupleCode(event);
  const couponId = cleanText(event.couponId || event.id);

  if (!couponId) {
    return fail("缺少奖券 id");
  }

  await removeByBusinessId(COLLECTIONS.coupons, coupleCode, couponId);

  return ok({
    couponId
  });
}

async function getWalletBundle(event) {
  const coupleCode = requireCoupleCode(event);
  const actorRole = normalizeRole(event.actorRole);
  const wallets = await ensureWalletDocs(coupleCode, actorRole);
  const couple = await ensureCoupleDoc(coupleCode);
  const ledger = await queryByCouple(COLLECTIONS.ledger, coupleCode, 100);
  const couponExchanges = await queryByCouple(COLLECTIONS.couponExchanges, coupleCode, 100);

  return ok({
    walletMode: "role",
    wallet: wallets[actorRole],
    wallets,
    members: publicMembers(couple),
    ledger: sortByLatest(ledger),
    ledgerQuickActions: sanitizeQuickActions(couple.ledgerQuickActions, Date.now()),
    couponExchanges: sortByLatest(couponExchanges)
  });
}

async function applyLedgerChange(event, wxContext) {
  const coupleCode = requireCoupleCode(event);
  const actor = normalizeActor(event, wxContext);
  const now = Date.now();
  const result = await addLedgerRecord(coupleCode, event.record || {}, actor, now);

  return ok(result);
}

async function saveLedgerQuickActions(event) {
  const coupleCode = requireCoupleCode(event);
  const now = Date.now();
  const couple = await ensureCoupleDoc(coupleCode);
  const ledgerQuickActions = sanitizeQuickActions(event.ledgerQuickActions, now);

  await db.collection(COLLECTIONS.couples).doc(couple._id).update({
    data: {
      ledgerQuickActions,
      updatedAt: now
    }
  });

  return ok({
    ledgerQuickActions
  });
}

async function exchangeCoupon(event, wxContext) {
  const coupleCode = requireCoupleCode(event);
  const actor = normalizeActor(event, wxContext);
  const couponId = cleanText(event.couponId || event.id);
  const now = Date.now();

  if (!couponId) {
    return fail("缺少奖券 id");
  }

  const coupon = await getByBusinessId(COLLECTIONS.coupons, coupleCode, couponId);

  if (!coupon) {
    return fail("没找到这张奖券");
  }

  if (numberOrDefault(coupon.stock) <= 0) {
    return fail("这张奖券暂时换完啦");
  }

  const wallet = await ensureRoleWalletDoc(coupleCode, actor.role);
  const cost = numberOrDefault(coupon.cost);

  if (wallet.balance < cost) {
    return fail("云朵币还差一点点");
  }

  await db.collection(COLLECTIONS.coupons).doc(coupon._id).update({
    data: {
      stock: _.inc(-1),
      updatedAt: now
    }
  });

  const ledgerResult = await addLedgerRecord(
    coupleCode,
    {
      id: `ledger_exchange_${now}`,
      type: "spend",
      amount: cost,
      reason: `兑换奖券：${coupon.title}`,
      couponId: coupon.id,
      targetRole: actor.role,
      createdAt: now
    },
    actor,
    now
  );
  const exchange = {
    id: `exchange_${now}`,
    coupleCode,
    couponId: coupon.id,
    title: coupon.title,
    emoji: coupon.emoji,
    cost,
    createdAt: now,
    targetRole: actor.role,
    targetRoleText: getRoleText(actor.role),
    createdByOpenid: actor.openid,
    createdByRole: actor.role,
    createdByName: actor.name
  };
  const exchangeResult = await db.collection(COLLECTIONS.couponExchanges).add({
    data: exchange
  });
  const nextCoupon = await db.collection(COLLECTIONS.coupons).doc(coupon._id).get();

  return ok({
    wallet: ledgerResult.wallet,
    coupon: nextCoupon.data,
    exchange: {
      _id: exchangeResult._id,
      ...exchange
    },
    ledgerRecord: ledgerResult.record
  });
}

async function listBlindVotes(event) {
  const coupleCode = requireCoupleCode(event);
  const couple = await ensureCoupleDoc(coupleCode);
  const blindVotes = await queryByCouple(COLLECTIONS.blindVotes, coupleCode, 100);

  return ok({
    members: publicMembers(couple),
    blindVotes: sortByLatest(blindVotes)
  });
}

async function saveBlindVote(event, wxContext) {
  const coupleCode = requireCoupleCode(event);
  const actor = normalizeActor(event, wxContext);
  const blindVote = await upsertByBusinessId(COLLECTIONS.blindVotes, coupleCode, event.blindVote || {}, actor, sanitizeVote);

  return ok({
    blindVote
  });
}

async function deleteBlindVote(event) {
  const coupleCode = requireCoupleCode(event);
  const blindVoteId = cleanText(event.blindVoteId || event.id);

  if (!blindVoteId) {
    return fail("缺少盲投 id");
  }

  await removeByBusinessId(COLLECTIONS.blindVotes, coupleCode, blindVoteId);

  return ok({
    blindVoteId
  });
}

async function listAlbumItems(event) {
  const coupleCode = requireCoupleCode(event);
  const couple = await ensureCoupleDoc(coupleCode);
  const albumItems = await queryByCouple(COLLECTIONS.albumItems, coupleCode, 100);

  return ok({
    members: publicMembers(couple),
    albumItems: sortByLatest(albumItems)
  });
}

async function saveAlbumItem(event, wxContext) {
  const coupleCode = requireCoupleCode(event);
  const actor = normalizeActor(event, wxContext);
  const albumItem = await upsertByBusinessId(COLLECTIONS.albumItems, coupleCode, event.albumItem || {}, actor, sanitizeAlbumItem);

  return ok({
    albumItem
  });
}

async function deleteAlbumItem(event) {
  const coupleCode = requireCoupleCode(event);
  const albumItemId = cleanText(event.albumItemId || event.id);

  if (!albumItemId) {
    return fail("缺少照片 id");
  }

  await removeByBusinessId(COLLECTIONS.albumItems, coupleCode, albumItemId);

  return ok({
    albumItemId
  });
}

async function listAnniversaries(event) {
  const coupleCode = requireCoupleCode(event);
  const anniversaries = await queryByCouple(COLLECTIONS.anniversaries, coupleCode, 100);

  return ok({
    anniversaries: sortByLatest(anniversaries)
  });
}

async function saveAnniversary(event, wxContext) {
  const coupleCode = requireCoupleCode(event);
  const actor = normalizeActor(event, wxContext);
  const anniversary = await upsertByBusinessId(COLLECTIONS.anniversaries, coupleCode, event.anniversary || {}, actor, sanitizeAnniversary);

  return ok({
    anniversary
  });
}

async function deleteAnniversary(event) {
  const coupleCode = requireCoupleCode(event);
  const anniversaryId = cleanText(event.anniversaryId || event.id);

  if (!anniversaryId) {
    return fail("缺少纪念日 id");
  }

  await removeByBusinessId(COLLECTIONS.anniversaries, coupleCode, anniversaryId);

  return ok({
    anniversaryId
  });
}

async function listMoodCheckins(event) {
  const coupleCode = requireCoupleCode(event);
  const couple = await ensureCoupleDoc(coupleCode);
  const moodCheckins = await queryByCouple(COLLECTIONS.moodCheckins, coupleCode, 100);

  return ok({
    members: publicMembers(couple),
    moodCheckins: sortByLatest(moodCheckins)
  });
}

async function saveMoodCheckin(event, wxContext) {
  const coupleCode = requireCoupleCode(event);
  const actor = normalizeActor(event, wxContext);
  const moodCheckin = await upsertByBusinessId(COLLECTIONS.moodCheckins, coupleCode, event.moodCheckin || {}, actor, sanitizeMoodCheckin);

  return ok({
    moodCheckin
  });
}

async function listLifeTasks(event) {
  const coupleCode = requireCoupleCode(event);
  const couple = await ensureCoupleDoc(coupleCode);
  const lifeTasks = await queryByCouple(COLLECTIONS.lifeTasks, coupleCode, 100);

  return ok({
    members: publicMembers(couple),
    lifeTasks: sortByLatest(lifeTasks)
  });
}

async function saveLifeTask(event, wxContext) {
  const coupleCode = requireCoupleCode(event);
  const actor = normalizeActor(event, wxContext);
  const lifeTask = await upsertByBusinessId(COLLECTIONS.lifeTasks, coupleCode, event.lifeTask || {}, actor, sanitizeLifeTask);

  return ok({
    lifeTask
  });
}

async function deleteLifeTask(event) {
  const coupleCode = requireCoupleCode(event);
  const lifeTaskId = cleanText(event.lifeTaskId || event.id);

  if (!lifeTaskId) {
    return fail("缺少任务 id");
  }

  await removeByBusinessId(COLLECTIONS.lifeTasks, coupleCode, lifeTaskId);

  return ok({
    lifeTaskId
  });
}

async function getCoupleProfiles(event) {
  const coupleCode = requireCoupleCode(event);
  const couple = await ensureCoupleDoc(coupleCode);

  return ok({
    members: publicMembers(couple),
    coupleProfiles: sanitizeCoupleProfiles(couple.coupleProfiles)
  });
}

async function saveCoupleProfiles(event) {
  const coupleCode = requireCoupleCode(event);
  const now = Date.now();
  const couple = await ensureCoupleDoc(coupleCode);
  const coupleProfiles = sanitizeCoupleProfiles(event.coupleProfiles);

  await db.collection(COLLECTIONS.couples).doc(couple._id).update({
    data: {
      coupleProfiles,
      updatedAt: now
    }
  });

  return ok({
    coupleProfiles
  });
}

async function getLifeBundle(event) {
  const coupleCode = requireCoupleCode(event);
  const couple = await ensureCoupleDoc(coupleCode);
  const albumItems = await queryByCouple(COLLECTIONS.albumItems, coupleCode, 100);
  const anniversaries = await queryByCouple(COLLECTIONS.anniversaries, coupleCode, 100);
  const moodCheckins = await queryByCouple(COLLECTIONS.moodCheckins, coupleCode, 100);
  const lifeTasks = await queryByCouple(COLLECTIONS.lifeTasks, coupleCode, 100);

  return ok({
    albumItems: sortByLatest(albumItems),
    anniversaries: sortByLatest(anniversaries),
    moodCheckins: sortByLatest(moodCheckins),
    lifeTasks: sortByLatest(lifeTasks),
    members: publicMembers(couple),
    coupleProfiles: sanitizeCoupleProfiles(couple.coupleProfiles)
  });
}

async function saveUserProfile(event, wxContext) {
  const coupleCode = requireCoupleCode(event);
  const now = Date.now();
  const profile = event.profile || {};
  const actor = normalizeActor(event, wxContext);
  let couple = await getCoupleDoc(coupleCode);

  if (!couple) {
    const member = buildMember(actor, profile, now);
    const coupleData = {
      coupleCode,
      members: [member],
      locked: false,
      createdByOpenid: actor.openid,
      ledgerQuickActions: DEFAULT_LEDGER_QUICK_ACTIONS,
      createdAt: now,
      updatedAt: now
    };
    const addResult = await db.collection(COLLECTIONS.couples).add({
      data: coupleData
    });

    couple = {
      _id: addResult._id,
      ...coupleData
    };
  } else {
    let members = normalizeMembers(couple);

    if (members.length === 0) {
      members = await seedMembersFromUsers(coupleCode, now);
    }

    const memberIndex = members.findIndex((member) => member.openid === actor.openid);

    if (memberIndex === -1 && (members.length >= 2 || couple.locked)) {
      return fail("这个绑定码已经绑定满两个人啦");
    }

    const nextMembers = memberIndex === -1
      ? members.concat(buildMember(actor, profile, now))
      : members.map((member, index) => (index === memberIndex ? buildMember(actor, profile, now, member) : member));
    const locked = nextMembers.length >= 2;

    await db.collection(COLLECTIONS.couples).doc(couple._id).update({
      data: {
        members: nextMembers,
        locked,
        updatedAt: now
      }
    });

    couple = {
      ...couple,
      members: nextMembers,
      locked,
      updatedAt: now
    };
  }

  const data = {
    coupleCode,
    coupleId: couple._id,
    openid: wxContext.OPENID,
    role: cleanText(profile.role || event.actorRole, "customer"),
    roleText: cleanText(profile.roleText),
    nickname: cleanText(profile.nickname || event.actorName, "用户"),
    avatarUrl: cleanText(profile.avatarUrl),
    updatedAt: now
  };
  const existing = await db
    .collection(COLLECTIONS.users)
    .where({
      openid: wxContext.OPENID
    })
    .limit(1)
    .get();

  if (existing.data[0]) {
    await db.collection(COLLECTIONS.users).doc(existing.data[0]._id).update({
      data
    });

    return ok({
      user: {
        _id: existing.data[0]._id,
        ...existing.data[0],
        ...data
      },
      couple: {
        _id: couple._id,
        coupleCode: couple.coupleCode,
        locked: Boolean(couple.locked),
        memberCount: normalizeMembers(couple).length,
        members: publicMembers(couple)
      }
    });
  }

  const addResult = await db.collection(COLLECTIONS.users).add({
    data: {
      ...data,
      createdAt: now
    }
  });

  return ok({
    user: {
      _id: addResult._id,
      ...data,
      createdAt: now
    },
    couple: {
      _id: couple._id,
      coupleCode: couple.coupleCode,
      locked: Boolean(couple.locked),
      memberCount: normalizeMembers(couple).length,
      members: publicMembers(couple)
    }
  });
}

exports.main = async (event, context) => {
  const wxContext = cloud.getWXContext();

  try {
    if (event.action === "saveUserProfile") {
      return await saveUserProfile(event, wxContext);
    }

    await requireCoupleMember(event, wxContext);

    if (event.action === "createOrder") {
      return await createOrder(event, wxContext);
    }

    if (event.action === "listOrders") {
      return await listOrders(event);
    }

    if (event.action === "updateOrderStatus") {
      return await updateOrderStatus(event, wxContext);
    }

    if (event.action === "listDishes") {
      return await listDishes(event);
    }

    if (event.action === "saveDish") {
      return await saveDish(event, wxContext);
    }

    if (event.action === "deleteDish") {
      return await deleteDish(event);
    }

    if (event.action === "listCoupons") {
      return await listCoupons(event);
    }

    if (event.action === "saveCoupon") {
      return await saveCoupon(event, wxContext);
    }

    if (event.action === "deleteCoupon") {
      return await deleteCoupon(event);
    }

    if (event.action === "getWalletBundle") {
      return await getWalletBundle(event);
    }

    if (event.action === "applyLedgerChange") {
      return await applyLedgerChange(event, wxContext);
    }

    if (event.action === "saveLedgerQuickActions") {
      return await saveLedgerQuickActions(event);
    }

    if (event.action === "exchangeCoupon") {
      return await exchangeCoupon(event, wxContext);
    }

    if (event.action === "listBlindVotes") {
      return await listBlindVotes(event);
    }

    if (event.action === "saveBlindVote") {
      return await saveBlindVote(event, wxContext);
    }

    if (event.action === "deleteBlindVote") {
      return await deleteBlindVote(event);
    }

    if (event.action === "listAlbumItems") {
      return await listAlbumItems(event);
    }

    if (event.action === "saveAlbumItem") {
      return await saveAlbumItem(event, wxContext);
    }

    if (event.action === "deleteAlbumItem") {
      return await deleteAlbumItem(event);
    }

    if (event.action === "listAnniversaries") {
      return await listAnniversaries(event);
    }

    if (event.action === "saveAnniversary") {
      return await saveAnniversary(event, wxContext);
    }

    if (event.action === "deleteAnniversary") {
      return await deleteAnniversary(event);
    }

    if (event.action === "listMoodCheckins") {
      return await listMoodCheckins(event);
    }

    if (event.action === "saveMoodCheckin") {
      return await saveMoodCheckin(event, wxContext);
    }

    if (event.action === "listLifeTasks") {
      return await listLifeTasks(event);
    }

    if (event.action === "saveLifeTask") {
      return await saveLifeTask(event, wxContext);
    }

    if (event.action === "deleteLifeTask") {
      return await deleteLifeTask(event);
    }

    if (event.action === "getCoupleProfiles") {
      return await getCoupleProfiles(event);
    }

    if (event.action === "saveCoupleProfiles") {
      return await saveCoupleProfiles(event);
    }

    if (event.action === "getLifeBundle") {
      return await getLifeBundle(event);
    }

    return fail("未知云端操作");
  } catch (error) {
    return fail(error.message || "云函数执行失败");
  }
};
