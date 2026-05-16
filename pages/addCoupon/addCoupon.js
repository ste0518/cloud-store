const {
  getCoupons,
  saveCoupons
} = require("../../utils/storage");
const { saveCloudCoupon } = require("../../utils/cloudData");

const defaultCouponForm = {
  title: "",
  emoji: "",
  description: "",
  cost: "",
  stock: "1"
};

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

Page({
  data: {
    couponForm: { ...defaultCouponForm }
  },

  handleCouponInput(event) {
    const { field } = event.currentTarget.dataset;

    this.setData({
      [`couponForm.${field}`]: event.detail.value
    });
  },

  validateCouponForm() {
    const { couponForm } = this.data;
    const title = couponForm.title.trim();
    const emoji = couponForm.emoji.trim();
    const cost = Number(couponForm.cost);
    const stock = Number(couponForm.stock);

    if (!title) {
      return "先写奖券名字吧";
    }

    if (!emoji) {
      return "给奖券配个 emoji 吧";
    }

    if (!cost || cost <= 0) {
      return "兑换价格要是正数哦";
    }

    if (!stock || stock <= 0) {
      return "库存至少要有 1 张";
    }

    return "";
  },

  async addCoupon() {
    const errorMessage = this.validateCouponForm();

    if (errorMessage) {
      wx.showToast({
        title: errorMessage,
        icon: "none"
      });
      return;
    }

    const { couponForm } = this.data;
    const now = Date.now();
    let coupon = {
      id: `coupon_${now}`,
      title: couponForm.title.trim(),
      emoji: couponForm.emoji.trim(),
      description: couponForm.description.trim(),
      cost: Number(couponForm.cost),
      stock: Number(couponForm.stock),
      createdAt: now
    };

    saveCoupons(getCoupons().map(normalizeCoupon).concat(coupon));

    try {
      const cloudCoupon = await saveCloudCoupon(coupon);

      if (cloudCoupon) {
        coupon = normalizeCoupon(cloudCoupon);
        saveCoupons(getCoupons().map((item) => (item.id === coupon.id ? coupon : normalizeCoupon(item))));
      }
    } catch (error) {
      wx.showToast({
        title: "本地已上架，云端稍后同步",
        icon: "none"
      });
    }

    wx.showToast({
      title: "奖券上架啦",
      icon: "success"
    });

    setTimeout(() => {
      if (getCurrentPages().length > 1) {
        wx.navigateBack();
        return;
      }

      wx.switchTab({
        url: "/pages/coupons/coupons"
      });
    }, 500);
  }
});
