const { getDishes, getProfile, saveDishes } = require("../../utils/storage");
const { saveCloudDish } = require("../../utils/cloudData");
const { dishCategories } = require("../../utils/constants");

const defaultForm = {
  name: "",
  icon: "",
  categoryIndex: 0,
  description: ""
};

Page({
  data: {
    form: { ...defaultForm },
    dishCategories
  },

  onLoad() {
    const profile = getProfile();

    if (!profile || profile.role !== "owner") {
      wx.showToast({
        title: "当前身份不能添加菜品",
        icon: "none"
      });

      setTimeout(() => {
        if (getCurrentPages().length > 1) {
          wx.navigateBack();
          return;
        }

        wx.switchTab({
          url: "/pages/menu/menu"
        });
      }, 500);
    }
  },

  handleInput(event) {
    const { field } = event.currentTarget.dataset;
    const { value } = event.detail;

    this.setData({
      [`form.${field}`]: value
    });
  },

  handleCategoryChange(event) {
    this.setData({
      "form.categoryIndex": Number(event.detail.value)
    });
  },

  validateForm() {
    const { form } = this.data;
    const name = form.name.trim();
    const icon = form.icon.trim();

    if (!name) {
      return "先给菜取个名字吧";
    }

    if (!icon) {
      return "给它配个 emoji 吧";
    }

    return "";
  },

  buildDish() {
    const { form, dishCategories } = this.data;
    const now = Date.now();

    return {
      id: `dish_${now}`,
      name: form.name.trim(),
      icon: form.icon.trim(),
      category: dishCategories[form.categoryIndex].value,
      description: form.description.trim(),
      difficulty: "easy",
      estimatedMinutes: 0,
      tags: [],
      availableToday: true,
      lastCookedAt: null,
      createdAt: now
    };
  },

  async saveDish() {
    const errorMessage = this.validateForm();

    if (errorMessage) {
      wx.showToast({
        title: errorMessage,
        icon: "none"
      });
      return;
    }

    const dishes = getDishes();
    let dish = this.buildDish();

    saveDishes(dishes.concat(dish));

    try {
      const cloudDish = await saveCloudDish(dish);

      if (cloudDish) {
        dish = cloudDish;
        saveDishes(getDishes().map((item) => (item.id === dish.id ? dish : item)));
      }
    } catch (error) {
      wx.showToast({
        title: "本地已保存，云端稍后同步",
        icon: "none"
      });
    }

    wx.showToast({
      title: "菜品已收好",
      icon: "success"
    });

    setTimeout(() => {
      const pages = getCurrentPages();

      if (pages.length > 1) {
        wx.navigateBack();
        return;
      }

      wx.switchTab({
        url: "/pages/menu/menu"
      });
    }, 500);
  },

  resetForm() {
    this.setData({
      form: { ...defaultForm }
    });
  }
});
