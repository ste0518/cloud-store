const {
  getAlbumItems,
  getAnniversaries,
  getCart,
  getCouponExchanges,
  getCoupleMembers,
  getLedger,
  getLifeTasks,
  getMoodCheckins,
  getOrders,
  getProfile,
  getWallet,
  saveOrders
} = require("../../utils/storage");
const { fetchCloudOrders } = require("../../utils/cloudOrders");
const { syncCloudLifeBundle, syncCloudWalletBundle } = require("../../utils/cloudData");
const { startPolling, stopPolling } = require("../../utils/polling");
const { setTabBarSelected } = require("../../utils/tabbar");

function getCartDishId(cartItem) {
  return typeof cartItem === "string" ? cartItem : cartItem.dishId || cartItem.id;
}

function todayKey() {
  const date = new Date();
  const month = `${date.getMonth() + 1}`.padStart(2, "0");
  const day = `${date.getDate()}`.padStart(2, "0");

  return `${date.getFullYear()}-${month}-${day}`;
}

function startOfDay(date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

function parseDate(value) {
  const parts = String(value || "").split("-").map(Number);
  return new Date(parts[0], (parts[1] || 1) - 1, parts[2] || 1);
}

function dayDiff(fromDate, toDate) {
  const diff = startOfDay(toDate).getTime() - startOfDay(fromDate).getTime();
  return Math.round(diff / 86400000);
}

function getNextAnniversaryDate(value) {
  const today = startOfDay(new Date());
  const source = parseDate(value);
  let next = new Date(today.getFullYear(), source.getMonth(), source.getDate());

  if (next.getTime() < today.getTime()) {
    next = new Date(today.getFullYear() + 1, source.getMonth(), source.getDate());
  }

  return next;
}

function getNearestAnniversary() {
  const anniversaries = getAnniversaries();

  if (!anniversaries.length) {
    return null;
  }

  return anniversaries
    .map((item) => ({
      ...item,
      daysToNext: Math.max(0, dayDiff(new Date(), getNextAnniversaryDate(item.date)))
    }))
    .sort((a, b) => a.daysToNext - b.daysToNext)[0];
}

const moodTextMap = {
  happy: "开心",
  tired: "有点累",
  comfort: "想被哄",
  quiet: "想安静",
  sweet: "想吃甜的",
  stress: "压力大"
};

const roleMeta = [
  { role: "owner", roleText: "老板" },
  { role: "customer", roleText: "顾客" }
];

const ledgerTypeTextMap = {
  earn: "记录了加分",
  deduct: "记录了扣分",
  spend: "兑换了奖励",
  remedy: "完成了补救"
};

const ACTIVITY_ACTIVE_WINDOW = 6 * 60 * 60 * 1000;

const allQuickEntries = [
  { title: "我的菜单", icon: "🍳", desc: "看看菜单里有什么", url: "/pages/menu/menu", tab: true },
  { title: "添加菜品", icon: "➕", desc: "收录拿手菜", url: "/pages/addDish/addDish", ownerOnly: true },
  { title: "今日点单", icon: "🧾", desc: "小篮子在这里", url: "/pages/cart/cart", tab: true },
  { title: "奖券商店", icon: "🎟️", desc: "兑换甜蜜奖励", url: "/pages/coupons/coupons", tab: true },
  { title: "云朵币账本", icon: "💗", desc: "记录加减分", url: "/pages/ledger/ledger" },
  { title: "今天吃什么", icon: "🎡", desc: "随机一道菜", url: "/pages/random/random", tab: true },
  { title: "默契盲投", icon: "🙈", desc: "各自写想吃的", url: "/pages/blindVote/blindVote" },
  { title: "心动相册", icon: "📷", desc: "收藏两个人的瞬间", url: "/pages/album/album" },
  { title: "纪念日", icon: "🗓️", desc: "倒数重要日子", url: "/pages/anniversary/anniversary" },
  { title: "心情签到", icon: "🌤️", desc: "今天想被怎样照顾", url: "/pages/mood/mood" },
  { title: "今日小单", icon: "✅", desc: "一起让生活轻一点", url: "/pages/tasks/tasks" },
  { title: "情侣档案", icon: "💞", desc: "记住偏好和雷区", url: "/pages/coupleProfile/coupleProfile" }
];

function normalizeRole(role) {
  return role === "owner" ? "owner" : "customer";
}

function getAvatarInitial(value, fallback) {
  const text = String(value || fallback || "云").trim();

  return text ? Array.from(text)[0] : "云";
}

function getActivityTime(item) {
  return item && (item.updatedAt || item.completedAt || item.acceptedAt || item.createdAt || 0);
}

function createActivity(role, name, text, time) {
  if (!time || !text) {
    return null;
  }

  return {
    role: role ? normalizeRole(role) : "",
    name: name || "",
    text,
    time
  };
}

function getOrderActivities(order) {
  const activities = [
    createActivity(
      order.createdByRole || order.customerRole,
      order.createdByName || order.customerName,
      "提交了点单",
      order.createdAt
    )
  ];

  if (order.status === "accepted" && order.acceptedAt) {
    activities.push(createActivity(order.updatedByRole, order.updatedByName, "接了订单", order.acceptedAt));
  }

  if (order.status === "completed" && order.completedAt) {
    activities.push(createActivity(order.updatedByRole, order.updatedByName, "完成了订单", order.completedAt));
  }

  if (order.status === "cancelled" && order.cancelledAt) {
    activities.push(createActivity(order.updatedByRole, order.updatedByName, "取消了点单", order.cancelledAt));
  }

  return activities.filter(Boolean);
}

function collectActivities() {
  const activities = [];

  getOrders().forEach((order) => {
    activities.push(...getOrderActivities(order));
  });

  getLedger().forEach((record) => {
    activities.push(createActivity(
      record.createdByRole,
      record.createdByName,
      ledgerTypeTextMap[record.type] || "更新了账本",
      record.createdAt
    ));
  });

  getCouponExchanges().forEach((exchange) => {
    activities.push(createActivity(exchange.createdByRole, exchange.createdByName, "兑换了奖券", exchange.createdAt));
  });

  getAlbumItems().forEach((item) => {
    activities.push(createActivity(item.updatedByRole, item.updatedByName || item.uploader, "更新了相册", getActivityTime(item)));
  });

  getAnniversaries().forEach((item) => {
    activities.push(createActivity(item.updatedByRole, item.updatedByName, "更新了纪念日", getActivityTime(item)));
  });

  getMoodCheckins().forEach((item) => {
    activities.push(createActivity(item.updatedByRole, item.updatedByName || item.role, "签到了心情", getActivityTime(item)));
  });

  getLifeTasks().forEach((item) => {
    activities.push(createActivity(
      item.updatedByRole,
      item.updatedByName || item.assignee,
      item.done ? "完成了小单" : "更新了小单",
      getActivityTime(item)
    ));
  });

  return activities.filter(Boolean);
}

function matchesActivity(slot, activity) {
  if (activity.role) {
    return normalizeRole(slot.role) === normalizeRole(activity.role);
  }

  return Boolean(activity.name && slot.nickname && activity.name === slot.nickname);
}

function buildCoupleAvatars(profile) {
  const members = getCoupleMembers();
  const activities = collectActivities();
  const now = Date.now();

  return roleMeta.map((meta) => {
    const member = members.find((item) => normalizeRole(item.role) === meta.role);
    const ownProfile = profile && normalizeRole(profile.role) === meta.role ? profile : null;
    const source = {
      ...(member || {}),
      ...(ownProfile || {})
    };
    const nickname = source.nickname || meta.roleText;
    const latestActivity = activities
      .filter((activity) => matchesActivity({ ...source, role: meta.role, nickname }, activity))
      .sort((a, b) => b.time - a.time)[0];

    return {
      role: meta.role,
      roleText: meta.roleText,
      nickname,
      avatarUrl: source.avatarUrl || "",
      avatarInitial: getAvatarInitial(nickname, meta.roleText),
      isMe: Boolean(ownProfile),
      hasJoined: Boolean(member || ownProfile),
      activityText: latestActivity ? latestActivity.text : member || ownProfile ? "已进入小铺" : "等待进入",
      activityActive: Boolean(latestActivity && now - latestActivity.time <= ACTIVITY_ACTIVE_WINDOW)
    };
  });
}

Page({
  data: {
    profile: null,
    profileText: "未选择身份",
    coupleAvatars: [],
    walletBalance: 0,
    cartCount: 0,
    lifeSummary: [],
    quickEntries: allQuickEntries
  },

  onShow() {
    setTabBarSelected(this, 0);
    this.loadHomeData();
    startPolling(this, this.loadHomeData);
  },

  onHide() {
    stopPolling(this);
  },

  onUnload() {
    stopPolling(this);
  },

  async loadHomeData() {
    const profile = getProfile();
    let wallet = getWallet();
    const cart = getCart();

    if (profile && profile.coupleCode) {
      try {
        const bundle = await syncCloudWalletBundle();
        wallet = bundle.wallet;
      } catch (error) {
        wallet = getWallet();
      }

      try {
        await syncCloudLifeBundle();
      } catch (error) {
        // 首页生活摘要可以继续使用本地缓存。
      }

      try {
        saveOrders(await fetchCloudOrders(20));
      } catch (error) {
        // 动态气泡会继续使用本地最近订单。
      }
    }

    const lifeSummary = this.buildLifeSummary(profile);
    const quickEntries = allQuickEntries.filter((entry) => {
      return !entry.ownerOnly || (profile && profile.role === "owner");
    });
    const coupleAvatars = buildCoupleAvatars(profile);

    this.setData({
      profile,
      profileText: profile ? `${profile.nickname || profile.roleText || "我"} · ${profile.coupleCode}` : "未选择身份",
      coupleAvatars,
      walletBalance: wallet.balance,
      cartCount: cart.map(getCartDishId).filter(Boolean).length,
      lifeSummary,
      quickEntries
    });
  },

  buildLifeSummary(profile) {
    const today = todayKey();
    const ownNames = [
      profile && profile.nickname,
      profile && profile.roleText
    ].filter(Boolean);
    const ownMood = getMoodCheckins()
      .slice()
      .reverse()
      .find((item) => item.date === today && ownNames.includes(item.role));
    const nearestAnniversary = getNearestAnniversary();
    const pendingTasks = getLifeTasks().filter((item) => !item.done).length;
    const albumCount = getAlbumItems().length;

    return [
      {
        icon: "🌤️",
        title: "今日心情",
        value: ownMood ? moodTextMap[ownMood.mood] || "已签到" : "未签到",
        url: "/pages/mood/mood"
      },
      {
        icon: "🗓️",
        title: "最近纪念日",
        value: nearestAnniversary ? `${nearestAnniversary.daysToNext} 天后` : "去添加",
        url: "/pages/anniversary/anniversary"
      },
      {
        icon: "✅",
        title: "待完成小单",
        value: `${pendingTasks} 件`,
        url: "/pages/tasks/tasks"
      },
      {
        icon: "📷",
        title: "相册照片",
        value: `${albumCount} 张`,
        url: "/pages/album/album"
      }
    ];
  },

  goPage(event) {
    const { url, tab } = event.currentTarget.dataset;

    if (tab) {
      wx.switchTab({ url });
      return;
    }

    wx.navigateTo({ url });
  },

  goRole() {
    wx.navigateTo({
      url: "/pages/role/role?edit=1"
    });
  }
});
