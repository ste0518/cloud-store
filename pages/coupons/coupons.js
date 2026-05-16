const {
  getCouponExchanges,
  getCoupons,
  getLedger,
  getProfile,
  getWallet,
  saveCouponExchanges,
  saveCoupons,
  saveLedger,
  saveWallet
} = require("../../utils/storage");
const {
  deleteCloudCoupon,
  exchangeCloudCoupon,
  syncCloudCoupons,
  syncCloudWalletBundle
} = require("../../utils/cloudData");
const { startPolling, stopPolling } = require("../../utils/polling");
const { setTabBarSelected } = require("../../utils/tabbar");

function normalizeCoupon(coupon) {
  return {
    ...coupon,
    title: coupon.title || coupon.name,
    emoji: coupon.emoji || coupon.icon || "🎟️",
    description: coupon.description || "",
    cost: Number(coupon.cost) || 0,
    stock: typeof coupon.stock === "number" ? coupon.stock : Number(coupon.stock) || 0
  };
}

function formatTime(timestamp) {
  if (!timestamp) {
    return "";
  }

  const date = new Date(timestamp);
  const month = `${date.getMonth() + 1}`.padStart(2, "0");
  const day = `${date.getDate()}`.padStart(2, "0");
  const hour = `${date.getHours()}`.padStart(2, "0");
  const minute = `${date.getMinutes()}`.padStart(2, "0");

  return `${month}-${day} ${hour}:${minute}`;
}

Page({
  data: {
    wallet: {
      balance: 0
    },
    coupons: [],
    exchanges: []
  },

  onShow() {
    setTabBarSelected(this, 3);
    this.loadCouponData();
    startPolling(this, this.loadCouponData);
  },

  onHide() {
    stopPolling(this);
  },

  onUnload() {
    stopPolling(this);
  },

  async loadCouponData(options = {}) {
    const silent = Boolean(options.silent);
    const profile = getProfile();

    if (profile && profile.coupleCode) {
      try {
        await syncCloudCoupons();
        await syncCloudWalletBundle();
      } catch (error) {
        if (!silent) {
          wx.showToast({
            title: error.message || "云奖券同步失败，先显示本地数据",
            icon: "none"
          });
        }
      }
    }

    const wallet = getWallet();
    const coupons = getCoupons().map((coupon) => {
      const normalizedCoupon = normalizeCoupon(coupon);
      const soldOut = normalizedCoupon.stock <= 0;
      const notEnoughCoins = wallet.balance < normalizedCoupon.cost;

      return {
        ...normalizedCoupon,
        disabled: soldOut || notEnoughCoins,
        actionText: soldOut ? "已兑完" : notEnoughCoins ? "差一点" : "兑换"
      };
    });
    const exchanges = getCouponExchanges()
      .slice()
      .sort((a, b) => b.createdAt - a.createdAt)
      .slice(0, 5)
      .map((exchange) => ({
        ...exchange,
        createdAtText: formatTime(exchange.createdAt)
      }));

    this.setData({
      wallet,
      coupons,
      exchanges
    });
  },

  goAddCoupon() {
    wx.navigateTo({
      url: "/pages/addCoupon/addCoupon"
    });
  },

  deleteCoupon(event) {
    const { id } = event.currentTarget.dataset;
    const coupons = getCoupons().map(normalizeCoupon);
    const coupon = coupons.find((item) => item.id === id);

    if (!coupon) {
      wx.showToast({
        title: "没找到这张奖券",
        icon: "none"
      });
      return;
    }

    wx.showModal({
      title: "下架奖券",
      content: `确定把「${coupon.title}」从奖券商店移走吗？`,
      confirmText: "下架",
      confirmColor: "#FF9EBB",
      success: async (res) => {
        if (!res.confirm) {
          return;
        }

        saveCoupons(coupons.filter((item) => item.id !== id));

        try {
          await deleteCloudCoupon(id);
        } catch (error) {
          wx.showToast({
            title: "本地已下架，云端稍后同步",
            icon: "none"
          });
        }

        this.loadCouponData();

        wx.showToast({
          title: "已经下架啦",
          icon: "success"
        });
      }
    });
  },

  async exchangeCoupon(event) {
    const { id } = event.currentTarget.dataset;
    const coupons = getCoupons().map(normalizeCoupon);
    const coupon = coupons.find((item) => item.id === id);

    if (!coupon) {
      wx.showToast({
        title: "没找到这张奖券",
        icon: "none"
      });
      return;
    }

    if (coupon.stock <= 0) {
      wx.showToast({
        title: "这张奖券暂时换完啦",
        icon: "none"
      });
      return;
    }

    const profile = getProfile();

    if (profile && profile.coupleCode) {
      try {
        await exchangeCloudCoupon(id);
        await this.loadCouponData();

        wx.showToast({
          title: "兑换成功，甜蜜入袋",
          icon: "success"
        });
        return;
      } catch (error) {
        wx.showToast({
          title: error.message || "云端兑换失败",
          icon: "none"
        });
        return;
      }
    }

    const wallet = getWallet();

    if (wallet.balance < coupon.cost) {
      wx.showToast({
        title: "云朵币还差一点点",
        icon: "none"
      });
      return;
    }

    const now = Date.now();
    const nextCoupons = coupons.map((item) => {
      if (item.id !== id) {
        return item;
      }

      return {
        ...item,
        stock: item.stock - 1
      };
    });
    const nextWallet = {
      ...wallet,
      balance: wallet.balance - coupon.cost,
      totalSpent: wallet.totalSpent + coupon.cost,
      updatedAt: now
    };
    const exchange = {
      id: `exchange_${now}`,
      couponId: coupon.id,
      title: coupon.title,
      emoji: coupon.emoji,
      cost: coupon.cost,
      createdAt: now
    };
    const ledgerRecord = {
      id: `ledger_${now}`,
      type: "spend",
      amount: coupon.cost,
      reason: `兑换奖券：${coupon.title}`,
      couponId: coupon.id,
      createdAt: now
    };

    saveCoupons(nextCoupons);
    saveWallet(nextWallet);
    saveCouponExchanges(getCouponExchanges().concat(exchange));
    saveLedger(getLedger().concat(ledgerRecord));
    this.loadCouponData();

    wx.showToast({
      title: "兑换成功，甜蜜入袋",
      icon: "success"
    });
  }
});
