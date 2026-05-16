const {
  getCart,
  getDishes,
  getOrders,
  getPartnerNickname,
  getProfile,
  saveCart,
  saveOrders
} = require("../../utils/storage");
const {
  createCloudOrder,
  fetchCloudOrders,
  updateCloudOrderStatus
} = require("../../utils/cloudOrders");
const { syncCloudDishes } = require("../../utils/cloudData");
const { startPolling, stopPolling } = require("../../utils/polling");
const { setTabBarSelected } = require("../../utils/tabbar");

const statusTextMap = {
  pending: "待接单",
  accepted: "已接单",
  completed: "已完成",
  cancelled: "已取消"
};

function getCartDishId(cartItem) {
  return typeof cartItem === "string" ? cartItem : cartItem.dishId || cartItem.id;
}

function getOrderKey(order) {
  return order && (order._id || order.cloudId || order.localId || order.id);
}

function mergeOrderList(orders, nextOrder) {
  const nextKey = getOrderKey(nextOrder);
  const exists = orders.some((order) => getOrderKey(order) === nextKey);

  if (!exists) {
    return orders.concat(nextOrder);
  }

  return orders.map((order) => (getOrderKey(order) === nextKey ? nextOrder : order));
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
    profile: null,
    roleDisplayText: "还没有选择身份",
    partnerName: "对方",
    isOwner: false,
    isCustomer: false,
    isSyncing: false,
    syncStatus: "",
    cartItems: [],
    notes: "",
    recentOrders: [],
    statusTextMap
  },

  onShow() {
    setTabBarSelected(this, 2);
    this.loadPageData();
    startPolling(this, this.loadPageData);
  },

  onHide() {
    stopPolling(this);
  },

  onUnload() {
    stopPolling(this);
  },

  async loadPageData(options = {}) {
    const silent = Boolean(options.silent);

    if (silent && this.data.isSyncing) {
      return;
    }

    const profile = getProfile();
    const isOwner = profile && profile.role === "owner";
    const isCustomer = profile && profile.role === "customer";
    const partnerName = getPartnerNickname();
    let dishes = getDishes();

    if (profile && profile.coupleCode) {
      try {
        dishes = await syncCloudDishes();
      } catch (error) {
        dishes = getDishes();
      }
    }

    const dishMap = dishes.reduce((map, dish) => {
      map[dish.id] = dish;
      return map;
    }, {});
    const cart = getCart();
    const validDishIds = [];
    const cartItems = cart
      .map((cartItem) => {
        const dishId = getCartDishId(cartItem);
        const dish = dishMap[dishId];

        if (!dish) {
          return null;
        }

        validDishIds.push(dishId);

        return {
          ...dish
        };
      })
      .filter(Boolean);

    if (validDishIds.length !== cart.length) {
      saveCart(validDishIds.map((dishId) => ({ dishId })));
    }

    let orders = getOrders();
    let syncStatus = profile ? "云订单同步中..." : "请先选择身份";

    this.setData({
      profile,
      roleDisplayText: profile ? (profile.nickname || profile.roleText || "用户") : "还没有选择身份",
      partnerName,
      isOwner,
      isCustomer,
      ...(silent
        ? {}
        : {
            isSyncing: Boolean(profile),
            syncStatus
          })
    });

    if (profile && profile.coupleCode) {
      try {
        orders = await fetchCloudOrders();
        saveOrders(orders);
        syncStatus = `已同步绑定码 ${profile.coupleCode}`;
      } catch (error) {
        syncStatus = "云同步暂不可用，正在显示本地订单";
      }
    }

    const recentOrders = this.buildRecentOrders(orders, dishMap, isOwner, isCustomer);

    this.setData({
      cartItems,
      recentOrders,
      ...(silent
        ? {}
        : {
            syncStatus,
            isSyncing: false
          })
    });
  },

  buildRecentOrders(orders, dishMap, isOwner, isCustomer) {
    return orders
      .slice()
      .sort((a, b) => b.createdAt - a.createdAt)
      .slice(0, 10)
      .map((order) => {
        const snapshots = Array.isArray(order.itemsSnapshot) ? order.itemsSnapshot : [];
        const itemNames = snapshots.length
          ? snapshots.map((dish) => `${dish.icon || ""} ${dish.name || "菜品"}`.trim())
          : (order.items || []).map((dishId) => {
              const dish = dishMap[dishId];
              return dish ? `${dish.icon} ${dish.name}` : "已删除菜品";
            });

        return {
          ...order,
          orderKey: getOrderKey(order),
          statusText: statusTextMap[order.status] || order.status,
          itemsText: itemNames.join("、"),
          createdAtText: formatTime(order.createdAt),
          customerText: order.customerName ? `来自 ${order.customerName}` : "",
          canAccept: isOwner && order.status === "pending",
          canOwnerCancel: isOwner && order.status === "pending",
          canComplete: isOwner && order.status === "accepted",
          canCustomerCancel: isCustomer && order.status === "pending"
        };
      });
  },

  handleNotesInput(event) {
    this.setData({
      notes: event.detail.value
    });
  },

  removeCartItem(event) {
    const { id } = event.currentTarget.dataset;
    const nextCart = getCart().filter((cartItem) => getCartDishId(cartItem) !== id);

    saveCart(nextCart);
    this.loadPageData();

    wx.showToast({
      title: "已从小篮子拿出",
      icon: "success"
    });
  },

  goMenu() {
    wx.switchTab({
      url: "/pages/menu/menu"
    });
  },

  goRole() {
    wx.navigateTo({
      url: "/pages/role/role?edit=1"
    });
  },

  async submitOrder() {
    if (this.data.isSyncing) {
      return;
    }

    const profile = getProfile();
    const cartItems = this.data.cartItems;

    if (!profile || !profile.coupleCode) {
      wx.showToast({
        title: "先选择身份和绑定码",
        icon: "none"
      });
      this.goRole();
      return;
    }

    if (profile.role !== "customer") {
      wx.showToast({
        title: "当前身份不能提交点单哦",
        icon: "none"
      });
      return;
    }

    if (cartItems.length === 0) {
      wx.showToast({
        title: "先选点想吃的吧",
        icon: "none"
      });
      return;
    }

    const now = Date.now();
    const order = {
      id: `order_${now}`,
      localId: `order_${now}`,
      coupleCode: profile.coupleCode,
      customerName: profile.nickname,
      customerRole: profile.role,
      items: cartItems.map((dish) => dish.id),
      itemsSnapshot: cartItems.map((dish) => ({
        id: dish.id,
        name: dish.name,
        icon: dish.icon,
        description: dish.description,
        category: dish.category
      })),
      notes: this.data.notes.trim(),
      status: "pending",
      createdAt: now,
      updatedAt: now,
      acceptedAt: null,
      completedAt: null,
      cancelledAt: null
    };

    this.setData({
      isSyncing: true,
      syncStatus: `正在把点单送到${getPartnerNickname()}那里...`
    });

    try {
      const cloudOrder = await createCloudOrder(order);

      saveOrders(mergeOrderList(getOrders(), cloudOrder));
      saveCart([]);

      this.setData({
        notes: ""
      });
      this.loadPageData();

      wx.showToast({
        title: "点单送达啦",
        icon: "success"
      });
    } catch (error) {
      this.setData({
        isSyncing: false,
        syncStatus: error.message || "云订单提交失败"
      });

      wx.showToast({
        title: "云订单提交失败",
        icon: "none"
      });
    }
  },

  acceptOrder(event) {
    const order = this.findOrderByEvent(event);

    this.updateOrderStatus(order, "accepted", "接单成功");
  },

  cancelOrder(event) {
    const order = this.findOrderByEvent(event);

    this.updateOrderStatus(order, "cancelled", "订单已取消");
  },

  completeOrder(event) {
    const order = this.findOrderByEvent(event);

    this.updateOrderStatus(order, "completed", "订单完成啦", async () => {
      await syncCloudDishes();
    });
  },

  findOrderByEvent(event) {
    const { id } = event.currentTarget.dataset;

    return getOrders().find((order) => getOrderKey(order) === id || order.id === id);
  },

  async updateOrderStatus(order, status, toastTitle, afterSuccess) {
    if (this.data.isSyncing) {
      return;
    }

    const profile = getProfile();

    if (!order) {
      wx.showToast({
        title: "没找到这张订单",
        icon: "none"
      });
      return;
    }

    if (!profile || !profile.coupleCode) {
      wx.showToast({
        title: "先选择身份和绑定码",
        icon: "none"
      });
      return;
    }

    this.setData({
      isSyncing: true,
      syncStatus: "正在同步订单状态..."
    });

    try {
      const cloudOrder = await updateCloudOrderStatus(order, status);

      saveOrders(mergeOrderList(getOrders(), cloudOrder));

      if (afterSuccess) {
        await afterSuccess(cloudOrder);
      }

      this.loadPageData();

      wx.showToast({
        title: toastTitle,
        icon: "success"
      });
    } catch (error) {
      this.setData({
        isSyncing: false,
        syncStatus: error.message || "订单状态同步失败"
      });

      wx.showToast({
        title: "订单状态同步失败",
        icon: "none"
      });
    }
  }
});
