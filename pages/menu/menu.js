const { getCart, getDishes, getPartnerNickname, getProfile, saveCart, saveDishes } = require("../../utils/storage");
const { deleteCloudDish, syncCloudDishes } = require("../../utils/cloudData");
const { dishCategories } = require("../../utils/constants");
const { startPolling, stopPolling } = require("../../utils/polling");
const { setTabBarSelected } = require("../../utils/tabbar");

const allCategory = { value: "all", label: "全部" };

Page({
  data: {
    dishes: [],
    filteredDishes: [],
    categoryFilters: [allCategory].concat(dishCategories),
    activeCategory: "all",
    categoryTextMap: {},
    profile: null,
    isOwner: false,
    partnerName: "对方",
    ownerSubtitle: "维护会做的菜，对方就能放心点单。",
    customerEmptyDesc: "菜单还空着，可以让对方先添加几道菜。"
  },

  onLoad() {
    this.setData({
      categoryTextMap: this.createCategoryTextMap()
    });
  },

  onShow() {
    setTabBarSelected(this, 1);
    this.loadDishes();
    startPolling(this, this.loadDishes);
  },

  onHide() {
    stopPolling(this);
  },

  onUnload() {
    stopPolling(this);
  },

  createCategoryTextMap() {
    return dishCategories.reduce((map, category) => {
      map[category.value] = category.label;
      return map;
    }, {});
  },

  async loadDishes(options = {}) {
    const silent = Boolean(options.silent);
    const profile = getProfile();
    const partnerName = getPartnerNickname();
    let dishes = getDishes();

    if (!silent) {
      this.setData(
        {
          profile,
          isOwner: profile && profile.role === "owner",
          partnerName,
          ownerSubtitle: `维护会做的菜，${partnerName}就能放心点单。`,
          customerEmptyDesc: `菜单还空着，可以让${partnerName}先添加几道菜。`,
          dishes
        },
        () => {
          this.applyFilters();
        }
      );
    }

    if (profile && profile.coupleCode) {
      try {
        dishes = await syncCloudDishes();
        this.setData(
          {
            dishes
          },
          () => {
            this.applyFilters();
          }
        );
      } catch (error) {
        if (!silent) {
          wx.showToast({
            title: "云菜单同步失败，先显示本地菜单",
            icon: "none"
          });
        }
      }
    }
  },

  applyFilters() {
    const { dishes, activeCategory } = this.data;
    const filteredDishes = dishes
      .filter((dish) => {
        const matchCategory = activeCategory === "all" || dish.category === activeCategory;

        return matchCategory;
      })
      .map((dish) => ({
        ...dish,
        categoryText: this.data.categoryTextMap[dish.category] || "其他"
      }));

    this.setData({
      filteredDishes
    });
  },

  changeCategory(event) {
    const { value } = event.currentTarget.dataset;

    this.setData(
      {
        activeCategory: value
      },
      () => {
        this.applyFilters();
      }
    );
  },

  goAddDish() {
    if (!this.data.isOwner) {
      wx.showToast({
        title: "当前身份不能添加菜品",
        icon: "none"
      });
      return;
    }

    wx.navigateTo({
      url: "/pages/addDish/addDish"
    });
  },

  addToCart(event) {
    const { id } = event.currentTarget.dataset;
    const dish = this.data.dishes.find((item) => item.id === id);

    if (!dish) {
      wx.showToast({
        title: "没找到这道菜哦",
        icon: "none"
      });
      return;
    }

    const cart = getCart();
    const hasAdded = cart.some((item) => item.id === id || item.dishId === id);

    if (hasAdded) {
      wx.showToast({
        title: "已经在今日点单里啦",
        icon: "none"
      });
      return;
    }

    saveCart(
      cart.concat({
        dishId: dish.id,
        addedAt: Date.now()
      })
    );

    wx.showToast({
      title: "已放进小篮子",
      icon: "success"
    });
  },

  deleteDish(event) {
    if (!this.data.isOwner) {
      wx.showToast({
        title: "当前身份不能删除菜品",
        icon: "none"
      });
      return;
    }

    const { id } = event.currentTarget.dataset;
    const dish = this.data.dishes.find((item) => item.id === id);

    if (!dish) {
      return;
    }

    wx.showModal({
      title: "移出菜单",
      content: `确定把「${dish.name}」从菜单里移开吗？`,
      confirmText: "删除",
      confirmColor: "#FF9EBB",
      success: async (res) => {
        if (!res.confirm) {
          return;
        }

        const nextDishes = this.data.dishes.filter((item) => item.id !== id);
        const nextCart = getCart().filter((item) => item.id !== id && item.dishId !== id);

        saveDishes(nextDishes);
        saveCart(nextCart);

        if (this.data.profile && this.data.profile.coupleCode) {
          try {
            await deleteCloudDish(id);
          } catch (error) {
            wx.showToast({
              title: "本地已删除，云端稍后再同步",
              icon: "none"
            });
          }
        }

        this.setData(
          {
            dishes: nextDishes
          },
          () => {
            this.applyFilters();
          }
        );

        wx.showToast({
          title: "已经移开啦",
          icon: "success"
        });
      }
    });
  }
});
