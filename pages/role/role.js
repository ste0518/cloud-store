const {
  getCoupleMembers,
  getProfile,
  resetAllData,
  saveCoupleMembers,
  saveProfile
} = require("../../utils/storage");
const { saveCloudProfile, uploadCloudAvatar } = require("../../utils/cloudData");

const roleOptions = [
  {
    value: "owner",
    title: "我是老板",
    icon: "👩‍🍳",
    desc: "维护菜单、接单和完成订单。"
  },
  {
    value: "customer",
    title: "我是顾客",
    icon: "🥰",
    desc: "把想吃的放进小篮子并提交点单。"
  }
];

function normalizeCode(value) {
  return String(value || "").trim().replace(/\s+/g, "").toUpperCase();
}

function normalizeRole(role) {
  return role === "owner" ? "owner" : "customer";
}

function getRoleMeta(role) {
  return roleOptions.find((item) => item.value === role) || roleOptions[1];
}

function getAvatarInitial(value, fallback) {
  const text = String(value || fallback || "我").trim();

  return text ? Array.from(text)[0] : "我";
}

function isCloudAvatar(value) {
  return typeof value === "string" && value.indexOf("cloud://") === 0;
}

function buildMemberSlots(savedProfile, members, draft) {
  const list = Array.isArray(members) ? members : [];
  const draftRole = draft && draft.selectedRole ? normalizeRole(draft.selectedRole) : "";

  return roleOptions.map((roleItem) => {
    const role = normalizeRole(roleItem.value);
    const savedMember = list.find((item) => normalizeRole(item.role) === role);
    const ownSavedProfile = savedProfile && normalizeRole(savedProfile.role) === role ? savedProfile : null;
    const isDraftSelf = draftRole === role;
    const source = {
      ...(savedMember || {}),
      ...(ownSavedProfile || {})
    };

    if (isDraftSelf) {
      source.nickname = String(draft.nickname || "").trim() || source.nickname || "我";
      source.avatarUrl = draft.avatarUrl || source.avatarUrl || "";
    }

    const nickname = source.nickname || roleItem.title.replace("我是", "");

    return {
      role,
      roleText: roleItem.title.replace("我是", ""),
      nickname,
      avatarUrl: source.avatarUrl || "",
      avatarInitial: getAvatarInitial(nickname, roleItem.icon),
      isMe: isDraftSelf,
      hasJoined: Boolean(savedMember || ownSavedProfile || isDraftSelf),
      statusText: isDraftSelf ? "我" : savedMember || ownSavedProfile ? "已进入" : "等待进入"
    };
  });
}

function createBindCode() {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let code = "SO-";

  for (let index = 0; index < 8; index += 1) {
    code += chars[Math.floor(Math.random() * chars.length)];
  }

  return code;
}

Page({
  data: {
    roleOptions,
    selectedRole: "",
    nickname: "",
    avatarUrl: "",
    avatarInitial: "我",
    memberSlots: [],
    coupleCode: "",
    editMode: false,
    lockedRole: "",
    lockedCode: "",
    lockedActive: false
  },

  onLoad(options) {
    const editMode = options && options.edit === "1";
    const profile = getProfile();

    if (profile && !editMode) {
      wx.switchTab({
        url: "/pages/index/index"
      });
      return;
    }

    const nextData = {
      editMode,
      selectedRole: profile ? profile.role : "",
      nickname: profile ? profile.nickname : "",
      avatarUrl: profile ? profile.avatarUrl || "" : "",
      coupleCode: profile ? profile.coupleCode : "",
      lockedRole: profile && profile.coupleCode ? profile.role : "",
      lockedCode: profile && profile.coupleCode ? normalizeCode(profile.coupleCode) : "",
      lockedActive: Boolean(profile && profile.coupleCode)
    };

    nextData.avatarInitial = getAvatarInitial(nextData.nickname);
    nextData.memberSlots = buildMemberSlots(profile, getCoupleMembers(), nextData);

    this.setData(nextData);
  },

  isRoleLockedForCurrentCode() {
    return Boolean(this.data.lockedActive && this.data.lockedRole);
  },

  selectRole(event) {
    const selectedRole = event.currentTarget.dataset.role;

    if (this.isRoleLockedForCurrentCode() && selectedRole !== this.data.lockedRole) {
      wx.showToast({
        title: "已绑定身份，不能切换",
        icon: "none"
      });
      return;
    }

    this.setData({
      selectedRole,
      nickname: this.data.nickname || "我",
      avatarInitial: getAvatarInitial(this.data.nickname || "我"),
      memberSlots: buildMemberSlots(getProfile(), getCoupleMembers(), {
        ...this.data,
        selectedRole,
        nickname: this.data.nickname || "我"
      })
    });
  },

  handleInput(event) {
    const { field } = event.currentTarget.dataset;

    const nextData = {
      [field]: event.detail.value
    };

    if (field === "coupleCode") {
      nextData.lockedActive = Boolean(
        this.data.lockedRole &&
        this.data.lockedCode &&
        normalizeCode(event.detail.value) === this.data.lockedCode
      );
    }

    if (field === "nickname") {
      nextData.avatarInitial = getAvatarInitial(event.detail.value);
    }

    if (field === "nickname" || field === "coupleCode") {
      nextData.memberSlots = buildMemberSlots(getProfile(), getCoupleMembers(), {
        ...this.data,
        ...nextData
      });
    }

    this.setData(nextData);
  },

  handleChooseAvatar(event) {
    const avatarUrl = event.detail && event.detail.avatarUrl ? event.detail.avatarUrl : "";

    if (!avatarUrl) {
      return;
    }

    this.setData({
      avatarUrl,
      memberSlots: buildMemberSlots(getProfile(), getCoupleMembers(), {
        ...this.data,
        avatarUrl
      })
    });
  },

  copyBindCode(code, successTitle, failTitle) {
    wx.setClipboardData({
      data: code,
      success: () => {
        wx.showToast({
          title: successTitle,
          icon: "success"
        });
      },
      fail: () => {
        wx.showToast({
          title: failTitle,
          icon: "none"
        });
      }
    });
  },

  generateCode() {
    const code = createBindCode();

    this.setData({
      coupleCode: code,
      lockedActive: false
    });

    this.copyBindCode(code, "已生成并复制", "绑定码已生成");
  },

  copyCode() {
    const code = normalizeCode(this.data.coupleCode);

    if (!code) {
      wx.showToast({
        title: "先生成或填写绑定码",
        icon: "none"
      });
      return;
    }

    this.setData({
      coupleCode: code
    });

    this.copyBindCode(code, "绑定码已复制", "复制失败，手动复制一下");
  },

  async saveRole() {
    const { selectedRole, nickname, coupleCode } = this.data;
    const nextCode = normalizeCode(coupleCode);
    const role = roleOptions.find((item) => item.value === selectedRole);
    const currentProfile = getProfile();
    const currentCode = currentProfile && currentProfile.coupleCode ? normalizeCode(currentProfile.coupleCode) : "";

    if (!selectedRole) {
      wx.showToast({
        title: "先选择身份",
        icon: "none"
      });
      return;
    }

    if (this.isRoleLockedForCurrentCode() && selectedRole !== this.data.lockedRole) {
      wx.showToast({
        title: "已绑定身份，不能切换",
        icon: "none"
      });
      return;
    }

    if (!nextCode) {
      wx.showToast({
        title: "填写同一个绑定码才能同步",
        icon: "none"
      });
      return;
    }

    const now = Date.now();
    let avatarUrl = this.data.avatarUrl || "";

    if (avatarUrl && !isCloudAvatar(avatarUrl)) {
      try {
        avatarUrl = await uploadCloudAvatar(avatarUrl, nextCode, selectedRole);
      } catch (error) {
        wx.showToast({
          title: error.message || "头像上传失败，请重新选择",
          icon: "none",
          duration: 2600
        });
        return;
      }
    }

    const profileData = {
      role: selectedRole,
      roleText: (role || getRoleMeta(selectedRole)).title.replace("我是", ""),
      nickname: nickname.trim() || "我",
      avatarUrl,
      coupleCode: nextCode,
      createdAt: currentProfile && currentProfile.createdAt ? currentProfile.createdAt : now,
      updatedAt: now
    };

    let cloudResult = null;

    try {
      cloudResult = await saveCloudProfile(profileData);
    } catch (error) {
      wx.showToast({
        title: error.message || "绑定失败，请换个绑定码",
        icon: "none",
        duration: 2600
      });
      return;
    }

    if (currentCode !== nextCode) {
      resetAllData();
    }

    saveProfile(profileData);

    if (cloudResult && cloudResult.couple && Array.isArray(cloudResult.couple.members)) {
      saveCoupleMembers(cloudResult.couple.members);
    }

    this.setData({
      avatarUrl,
      memberSlots: buildMemberSlots(profileData, getCoupleMembers(), {
        ...this.data,
        avatarUrl
      })
    });

    wx.showToast({
      title: "身份保存好啦",
      icon: "success"
    });

    setTimeout(() => {
      wx.switchTab({
        url: "/pages/index/index"
      });
    }, 500);
  }
});
