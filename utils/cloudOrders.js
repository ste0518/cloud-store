const { getProfile } = require("./storage");

const ORDER_FUNCTION_NAME = "orderService";

function getActiveProfile() {
  return getProfile();
}

function hasCloudSupport() {
  return Boolean(wx.cloud && wx.cloud.callFunction);
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

function normalizeCloudOrder(order) {
  return {
    ...order,
    id: order.id || order.localId,
    localId: order.localId || order.id
  };
}

async function callOrderService(action, data = {}) {
  const profile = assertCloudReady();
  const response = await wx.cloud.callFunction({
    name: ORDER_FUNCTION_NAME,
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
    throw new Error(result.message || "云订单同步失败");
  }

  return result;
}

async function createCloudOrder(order) {
  const result = await callOrderService("createOrder", {
    order: normalizeCloudOrder(order)
  });

  return normalizeCloudOrder(result.order);
}

async function fetchCloudOrders(limit = 30) {
  const result = await callOrderService("listOrders", {
    limit
  });

  return (result.orders || []).map(normalizeCloudOrder);
}

async function updateCloudOrderStatus(order, status) {
  const result = await callOrderService("updateOrderStatus", {
    orderId: order._id || order.cloudId || order.id,
    localId: order.localId || order.id,
    status
  });

  return normalizeCloudOrder(result.order);
}

module.exports = {
  hasCloudSupport,
  getActiveProfile,
  createCloudOrder,
  fetchCloudOrders,
  updateCloudOrderStatus
};
