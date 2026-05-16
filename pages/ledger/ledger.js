const {
  getLedger,
  getLedgerQuickActions,
  getProfile,
  getWallet,
  getWallets,
  saveLedger,
  saveLedgerQuickActions,
  saveWallet
} = require("../../utils/storage");
const {
  applyCloudLedgerChange,
  saveCloudLedgerQuickActions,
  syncCloudWalletBundle
} = require("../../utils/cloudData");
const { startPolling, stopPolling } = require("../../utils/polling");

const typeOptions = [
  { value: "earn", label: "加分" },
  { value: "deduct", label: "扣分" }
];

const defaultQuickActionForm = {
  amount: "",
  reason: "",
  typeIndex: 0
};

const typeTextMap = {
  earn: "加分",
  deduct: "扣分",
  spend: "兑换",
  remedy: "加分"
};

function formatTime(timestamp) {
  const date = new Date(timestamp);
  const month = `${date.getMonth() + 1}`.padStart(2, "0");
  const day = `${date.getDate()}`.padStart(2, "0");
  const hour = `${date.getHours()}`.padStart(2, "0");
  const minute = `${date.getMinutes()}`.padStart(2, "0");

  return `${month}-${day} ${hour}:${minute}`;
}

function isPositiveType(type) {
  return type === "earn" || type === "remedy";
}

function getActiveRole() {
  const profile = getProfile();

  return profile && profile.role === "owner" ? "owner" : "customer";
}

function getCounterpartRole() {
  return getActiveRole() === "owner" ? "customer" : "owner";
}

function normalizeQuickAction(action) {
  return {
    ...action,
    id: action.id || `quick_${action.type || "action"}_${action.reason}`,
    amount: Number(action.amount) || 0,
    reason: action.reason || "",
    type: action.type || "earn",
    createdAt: action.createdAt || 0
  };
}

function normalizeQuickActions(actions) {
  return {
    earn: Array.isArray(actions && actions.earn) ? actions.earn.map(normalizeQuickAction) : [],
    deduct: Array.isArray(actions && actions.deduct) ? actions.deduct.map(normalizeQuickAction) : []
  };
}

Page({
  data: {
    wallet: {
      balance: 0,
      totalEarned: 0,
      totalSpent: 0,
      totalPenalty: 0,
      updatedAt: ""
    },
    records: [],
    typeOptions,
    quickEarnActions: [],
    quickDeductActions: [],
    form: {
      amount: "",
      reason: "",
      typeIndex: 0
    },
    quickActionForm: { ...defaultQuickActionForm }
  },

  onShow() {
    this.loadLedgerData();
    startPolling(this, this.loadLedgerData);
  },

  onHide() {
    stopPolling(this);
  },

  onUnload() {
    stopPolling(this);
  },

  async loadLedgerData(options = {}) {
    const silent = Boolean(options.silent);
    const profile = getProfile();

    if (profile && profile.coupleCode) {
      try {
        await syncCloudWalletBundle();
      } catch (error) {
        if (!silent) {
          wx.showToast({
            title: error.message || "云账本同步失败，先显示本地记录",
            icon: "none"
          });
        }
      }
    }

    const wallet = getWallet();
    const records = this.buildRecords(getLedger());
    const quickActions = normalizeQuickActions(getLedgerQuickActions());

    this.setData({
      wallet,
      records,
      quickEarnActions: quickActions.earn,
      quickDeductActions: quickActions.deduct
    });
  },

  buildRecords(ledger) {
    return ledger
      .slice()
      .sort((a, b) => b.createdAt - a.createdAt)
      .map((record) => {
        const positive = isPositiveType(record.type);

        return {
          ...record,
          typeText: typeTextMap[record.type] || "记录",
          sign: positive ? "+" : "-",
          signedAmount: `${positive ? "+" : "-"}${record.amount}`,
          amountClass: positive ? "positive" : "negative",
          createdAtText: formatTime(record.createdAt)
        };
      });
  },

  handleInput(event) {
    const { field } = event.currentTarget.dataset;

    this.setData({
      [`form.${field}`]: event.detail.value
    });
  },

  handleTypeChange(event) {
    this.setData({
      "form.typeIndex": Number(event.detail.value)
    });
  },

  handleQuickInput(event) {
    const { field } = event.currentTarget.dataset;

    this.setData({
      [`quickActionForm.${field}`]: event.detail.value
    });
  },

  handleQuickTypeChange(event) {
    this.setData({
      "quickActionForm.typeIndex": Number(event.detail.value)
    });
  },

  submitManualRecord() {
    const { form } = this.data;
    const amount = Number(form.amount);
    const reason = form.reason.trim();
    const type = typeOptions[form.typeIndex].value;

    if (!amount || amount <= 0) {
      wx.showToast({
        title: "金额要填正数哦",
        icon: "none"
      });
      return;
    }

    if (!reason) {
      wx.showToast({
        title: "写个小原因吧",
        icon: "none"
      });
      return;
    }

    this.applyLedgerChange({
      type,
      amount,
      reason
    });

    this.setData({
      form: {
        amount: "",
        reason: "",
        typeIndex: 0
      }
    });
  },

  applyQuickAction(event) {
    const { type, amount, reason } = event.currentTarget.dataset;

    this.applyLedgerChange({
      type,
      amount: Number(amount),
      reason
    });
  },

  async addQuickAction() {
    const { quickActionForm } = this.data;
    const amount = Number(quickActionForm.amount);
    const reason = quickActionForm.reason.trim();
    const type = typeOptions[quickActionForm.typeIndex].value;

    if (!amount || amount <= 0) {
      wx.showToast({
        title: "快捷金额要是正数哦",
        icon: "none"
      });
      return;
    }

    if (!reason) {
      wx.showToast({
        title: "给快捷项起个名字吧",
        icon: "none"
      });
      return;
    }

    const now = Date.now();
    const quickActions = normalizeQuickActions(getLedgerQuickActions());
    const nextActions = {
      ...quickActions,
      [type]: quickActions[type].concat({
        id: `quick_${type}_${now}`,
        type,
        amount,
        reason,
        createdAt: now
      })
    };

    saveLedgerQuickActions(nextActions);

    try {
      await saveCloudLedgerQuickActions(nextActions);
    } catch (error) {
      wx.showToast({
        title: "本地已保存，云端稍后同步",
        icon: "none"
      });
    }

    this.setData({
      quickActionForm: { ...defaultQuickActionForm }
    });
    this.loadLedgerData();

    wx.showToast({
      title: "快捷按钮收好啦",
      icon: "success"
    });
  },

  deleteQuickAction(event) {
    const { id, type } = event.currentTarget.dataset;
    const quickActions = normalizeQuickActions(getLedgerQuickActions());
    const target = quickActions[type].find((item) => item.id === id);

    if (!target) {
      wx.showToast({
        title: "没找到这个快捷项",
        icon: "none"
      });
      return;
    }

    wx.showModal({
      title: "删除快捷项",
      content: `确定删除「${target.reason}」吗？`,
      confirmText: "删除",
      confirmColor: "#FF9EBB",
      success: async (res) => {
        if (!res.confirm) {
          return;
        }

        const nextActions = {
          ...quickActions,
          [type]: quickActions[type].filter((item) => item.id !== id)
        };

        saveLedgerQuickActions(nextActions);

        try {
          await saveCloudLedgerQuickActions(nextActions);
        } catch (error) {
          wx.showToast({
            title: "本地已删除，云端稍后同步",
            icon: "none"
          });
        }

        this.loadLedgerData();

        wx.showToast({
          title: "快捷项已删除",
          icon: "success"
        });
      }
    });
  },

  async applyLedgerChange({ type, amount, reason, toastTitle }) {
    const now = Date.now();
    const positive = isPositiveType(type);
    const profile = getProfile();

    if (profile && profile.coupleCode) {
      try {
        const result = await applyCloudLedgerChange({
          type,
          amount,
          reason,
          targetRole: getCounterpartRole(),
          createdAt: now
        });
        await this.loadLedgerData();

        if (type === "deduct" && result && result.wallet && result.wallet.balance < 0) {
          wx.showToast({
            title: "云朵币变成负数啦，可以再记几笔加分慢慢赚回来。",
            icon: "none",
            duration: 2600
          });
          return;
        }

        wx.showToast({
          title: toastTitle || (positive ? `+${amount} 云朵币` : `-${amount} 云朵币`),
          icon: "success"
        });
        return;
      } catch (error) {
        wx.showToast({
          title: error.message || "云账本记录失败",
          icon: "none"
        });
        return;
      }
    }

    const targetRole = getCounterpartRole();
    const wallet = getWallets()[targetRole];
    const nextBalance = positive ? wallet.balance + amount : wallet.balance - amount;
    const nextWallet = {
      ...wallet,
      balance: nextBalance,
      totalEarned: positive ? wallet.totalEarned + amount : wallet.totalEarned,
      totalSpent: type === "spend" ? wallet.totalSpent + amount : wallet.totalSpent,
      totalPenalty: type === "deduct" ? wallet.totalPenalty + amount : wallet.totalPenalty,
      updatedAt: now
    };
    const record = {
      id: `ledger_${now}`,
      type,
      amount,
      reason,
      targetRole,
      createdAt: now
    };

    saveWallet(nextWallet, targetRole);
    saveLedger(getLedger().concat(record));
    this.loadLedgerData();

    if (type === "deduct" && nextBalance < 0) {
      wx.showToast({
        title: "云朵币变成负数啦，可以再记几笔加分慢慢赚回来。",
        icon: "none",
        duration: 2600
      });
      return;
    }

    wx.showToast({
      title: toastTitle || (positive ? `+${amount} 云朵币` : `-${amount} 云朵币`),
      icon: "success"
    });
  }
});
