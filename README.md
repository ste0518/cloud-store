# 云朵小铺 cloud-store

## 项目名称

云朵小铺 cloud-store

## 产品定位

云朵小铺是一个情侣使用的可爱风微信小程序 MVP。它把“今天吃什么”“谁来做”“怎么记录心愿和小奖励”做成一个轻松的小互动：一方可以把想吃的菜加入今日点单，另一方接单完成；云朵币可以通过任务或账本记录获得，并兑换双方自己上架的小奖券。

当前版本是本地缓存 + 微信云开发同步 MVP：角色身份和今日点单小篮子保存在本机，菜单、订单、奖券、云朵币钱包、账本、快捷账本按钮和双人盲投通过同一个绑定码同步到云数据库，适合用两台手机或“手机 + 开发者工具模拟器”验证双人路径。云朵币按老板端和顾客端分别独立计算，页面只显示当前身份自己的余额。

## 功能模块

- 角色入口：首次进入选择“老板 / 顾客”，两端填写同一个绑定码后同步共享数据。
- 首页仪表盘：展示身份、云朵币余额、今日点单数量、最近订单状态、今日推荐菜和快捷入口。
- 菜单系统：菜单同步到云端，老板端可添加和删除菜品，顾客端可加入今日点单。
- 添加菜品：老板端通过原生表单创建菜品，填写菜名、emoji、分类和描述。
- 今日点单：顾客端提交订单到云数据库；老板端接单、取消、完成订单并同步状态，点菜本身不再自动增加云朵币。
- 云朵币账本：余额、积分历史和快捷加减分按钮同步到云端，支持手动给对方加分、扣分。
- 奖券商店：奖券、库存和兑换历史同步到云端，兑换后扣分并写入账本。
- 今天吃什么：从菜单中随机抽取一道菜，并可直接加入今日点单。
- 双人盲投：创建吃什么投票，A/B 可各自输入想吃的，双方提交前隐藏具体选择，双方提交后揭晓结果。
- 心动相册：照片元数据同步到云端，新增照片会上传到云存储后共享展示。
- 纪念日：重要日期和倒计时同步到云端。
- 心情签到：双方每日心情同步到云端。
- 今日小单：生活任务同步到云端，完成任务可自动写入云朵币账本。
- 情侣档案：偏好、雷区和安慰方式同步到云端。

## 页面结构

- `pages/role/role`：老板 / 顾客角色入口
- `pages/index/index`：首页
- `pages/menu/menu`：菜单页
- `pages/addDish/addDish`：添加菜品页
- `pages/cart/cart`：今日点单页
- `pages/coupons/coupons`：奖券页
- `pages/random/random`：今天吃什么页
- `pages/blindVote/blindVote`：双人盲投页
- `pages/ledger/ledger`：云朵币账本页
- `pages/album/album`：心动相册页
- `pages/anniversary/anniversary`：纪念日页
- `pages/mood/mood`：心情签到页
- `pages/tasks/tasks`：今日小单页
- `pages/coupleProfile/coupleProfile`：情侣档案页

tabBar 包含：首页、菜单、点单、奖券、决策。

## 数据结构

### Dish 菜品

```js
{
  id: string,
  name: string,
  icon: string,
  category: "main" | "dish" | "soup" | "dessert" | "drink" | "other",
  description: string,
  availableToday: boolean,
  lastCookedAt: number | null,
  createdAt: number
}
```

### Order 订单

```js
{
  _id: string,
  id: string,
  localId: string,
  coupleCode: string,
  customerName: string,
  items: string[],
  itemsSnapshot: Array<{
    id: string,
    name: string,
    icon: string,
    description: string,
    category: string
  }>,
  notes: string,
  status: "pending" | "accepted" | "completed" | "cancelled",
  createdAt: number,
  acceptedAt: number | null,
  completedAt: number | null,
  cancelledAt: number | null
}
```

### Profile 本机身份

```js
{
  role: "owner" | "customer",
  roleText: string,
  nickname: string,
  coupleCode: string,
  createdAt: number,
  updatedAt: number
}
```

### Wallet 钱包

```js
{
  owner: {
    balance: number,
    totalEarned: number,
    totalSpent: number,
    totalPenalty: number,
    updatedAt: number | string
  },
  customer: {
    balance: number,
    totalEarned: number,
    totalSpent: number,
    totalPenalty: number,
    updatedAt: number | string
  }
}
```

### Ledger 云朵币账本

```js
{
  id: string,
  type: "earn" | "deduct" | "spend",
  amount: number,
  reason: string,
  targetRole: "owner" | "customer",
  createdAt: number
}
```

### Coupon 奖券

```js
{
  id: string,
  title: string,
  emoji: string,
  description: string,
  cost: number,
  stock: number
}
```

### BlindVote 双人盲投

```js
{
  id: string,
  title: string,
  options: string[],
  votes: {
    personA: string | null,
    personB: string | null
  },
  revealed: boolean,
  result: string | null,
  createdAt: number
}
```

## 本地缓存与云同步

本机缓存统一由 `utils/storage.js` 管理，内部使用：

- `wx.getStorageSync`
- `wx.setStorageSync`

主要本地 storage key：

- `dishes`
- `cart`
- `orders`
- `coupons`
- `couponExchanges`
- `wallet`
- `ledger`
- `ledgerQuickActions`
- `blindVotes`
- `profile`

其中 `profile` 和 `cart` 是本机状态：同一台手机当前扮演谁、当前小篮子里临时放了什么。其余共享数据会在页面进入或操作时同步到云端，并回写本地缓存。

业务常量位于 `utils/constants.js`，目前主要包含菜品分类。点菜只负责提交和处理订单，不再绑定云朵币奖励。

云同步由以下文件负责：

- `utils/cloudOrders.js`：小程序端调用云函数。
- `utils/cloudData.js`：菜单、奖券、钱包账本、盲投等共享数据同步工具。
- `cloudfunctions/orderService/index.js`：云函数，负责订单和共享数据的增删改查。

云数据库集合：

- `orders`
- `dishes`
- `coupons`
- `couponExchanges`
- `wallets`
- `ledger`
- `blindVotes`
- `albumItems`
- `anniversaries`
- `moodCheckins`
- `lifeTasks`
- `couples`
- `users`

如果云端集合为空，而本机已有菜单、奖券、盲投、纪念日、心情或任务记录，第一次同步时会自动把本机已有数据补到云端，方便从本地 MVP 平滑过渡到云端 MVP。相册照片需要上传到云存储后才能在另一台设备显示。

安全建议：以上集合的数据库权限建议全部设置为“所有用户不可读写”。小程序端不直接访问数据库，统一通过 `cloudfunctions/orderService` 云函数读写；云函数会检查当前微信用户 `openid` 是否属于该绑定码的 `couples.members`。一个绑定码最多绑定两个 `openid`，绑定满两人后自动锁定。

## 如何运行

1. 打开微信开发者工具。
2. 选择“导入项目”。
3. 项目目录选择当前目录。
4. 填入已开通云开发的小程序 AppID。
5. 在云开发控制台确认已创建以上云数据库集合。
6. 在微信开发者工具左侧找到 `cloudfunctions/orderService`，右键选择“创建并部署：云端安装依赖（不上传 node_modules）”或“上传并部署：云端安装依赖”。
7. 点击“编译”。
8. 首次进入选择角色：
   - 老板端：选择“我是老板”，生成或填写绑定码。
   - 顾客端：选择“我是顾客”，填写和老板相同的绑定码。
9. 从首页开始体验完整路径：
   - 添加菜品
   - 菜单加入今日点单
   - 顾客端提交订单
   - 老板端接单并完成订单
   - 兑换奖券
   - 使用今天吃什么
   - 创建双人盲投

## 后续优化方向

当前 MVP 已经把核心共享数据接入微信云开发。后续可以继续补：

- 云数据库权限规则和更正式的情侣绑定流程。
- 菜单编辑、奖券编辑、订单消息订阅通知。
- 云端数据分页、索引和更严格的并发处理。
- 小程序发布前的真机兼容测试和图标资源压缩。
