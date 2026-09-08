# 雪球大战 Snowball Battle

[English](./README.md) · [简体中文](./README.zh-CN.md) · [日本語](./README.ja.md)

一款轻量级的多人在线网页打雪仗游戏，玩法灵感来自经典 **“可乐8”《打雪仗》**。

> 这是一个独立的开源重制 / 致敬项目，与原游戏运营方或相关权利方不存在隶属、授权或合作关系。本仓库不包含从原游戏直接提取的程序文件或素材。

![雪球大战游戏画面](./docs/screenshots/gameplay-battle.webp)
![雪球大战游戏画面](./docs/screenshots/join-screen.webp)
![雪球大战游戏画面](./docs/screenshots/gameplay-config.webp)
![雪球大战游戏画面](./docs/screenshots/gameplay-snowman.webp)
![雪球大战游戏画面](./docs/screenshots/death-screen.webp)

## 主要特点

- 🔵 **蓝方 vs 红方** 实时阵营对战
- 🖱️ **鼠标右键移动**、**鼠标左键投雪球**
- ❄️ 雪球可以快速连续投掷，红蓝双方雪球拥有对应阵营的描边 / 拖尾
- ☃️ **雪人挂机保护**：连续 8 秒无移动、无攻击且已脱战，会冻成无敌雪人
- 🧊 地图随机生成：湖泊、栅栏、树木、房屋、石头、冰雪装饰等
- 🚧 **栅栏和湖泊阻挡人物移动**；树木和房屋只做视觉元素，可直接穿过
- 🏹 雪球不会被地图障碍阻挡
- 🤖 左上角可分别配置蓝方 / 红方机器人数量，默认 0 / 0
- ❤️ 100 HP、雪球单次 20 伤害、阵营比分及个人击杀/死亡/命中统计
- 💀 真人玩家死亡后不会自动复活，只能点击 **“立即复活”**
- 🎯 死亡弹窗会显示具体是谁击倒了你
- 🎮 多方向 Sprite 动画、雪人状态、平滑人物与镜头跟随
- 🌐 Node.js 实时服务器 + 浏览器 Canvas 渲染
- 📦 当前运行时无第三方依赖

## 游戏截图

### 选择阵营

![选择阵营](./docs/screenshots/join-screen.webp)

### 机器人配置与战斗

![机器人配置](./docs/screenshots/gameplay-config.webp)

### 雪人状态

![雪人状态](./docs/screenshots/gameplay-snowman.webp)

### 被击倒与手动复活

![死亡界面](./docs/screenshots/death-screen.webp)

## 操作方式

| 操作 | 功能 |
| --- | --- |
| 鼠标右键 | 移动到点击位置；会自动绕开栅栏和湖泊 |
| 鼠标左键 | 朝点击位置投掷雪球 |
| 鼠标指向敌方 | 鼠标箭头变红，方便识别可攻击目标 |
| 左上角“配置” | 设置蓝方 / 红方机器人数量 |
| “立即复活” | 死亡后手动在随机合法位置复活 |

游戏区域会禁用浏览器原生右键菜单，让右键始终用于游戏移动。

## 核心规则

- 玩家进入前自行选择蓝方或红方。
- 地图没有固定红蓝基地，所有玩家随机出生。
- 鼠标点击位置在最大射程内时，雪球只飞到点击距离；超出射程才限制为最大射程。
- 多颗雪球可以同时存在，不需要等上一颗消失后才能继续投掷。
- 雪球只伤害敌方，不会伤害队友。
- 真人玩家死亡后**不会自动复活**，必须点击“立即复活”。
- 机器人可以自动复活，方便持续测试对局。
- 连续 **8 秒**没有移动和主动攻击，同时已经脱离战斗，会自动冻成雪人。
- 雪人状态无敌；再次移动或攻击会触发解冻。

## 当前主要数值

| 配置 | 数值 |
| --- | ---: |
| 生命值 | 100 |
| 单颗雪球伤害 | 20 |
| 雪球最大射程 | 500 |
| 雪人触发时间 | 8 秒 |
| 脱战要求 | 约 5 秒 |
| 出生保护 | 约 1.8 秒 |
| 默认机器人 | 蓝 0 / 红 0 |

## 快速启动

### 环境要求

- Node.js **18+**
- 推荐 Chrome / Edge 等现代桌面浏览器

### 本地运行

```bash
git clone https://github.com/yua3891/snowball-battle.git
cd snowball-battle
npm start
```

浏览器打开：

```text
http://localhost:8080
```

Windows 用户也可以直接双击 `start.bat`。

### 自定义端口

```bash
PORT=8090 npm start
```

### Docker

```bash
docker build -t snowball-battle .
docker run --rm -p 8080:8080 snowball-battle
```

## 技术实现

- **前端：** HTML + CSS + JavaScript + Canvas
- **服务端：** Node.js 原生 HTTP + WebSocket 帧处理
- **网络：** 伤害、雪球和玩家状态由服务端权威判定
- **移动：** 本地玩家预测、远端玩家插值/外推、摄像机平滑跟随
- **寻路：** 基于网格的栅栏 / 湖泊绕行

## 关于“可乐8 / 打雪仗”

本项目受到经典“可乐8”《打雪仗》网页游戏的玩法启发，希望用现代、可阅读的开源代码重新实现其有趣的核心交互：红蓝阵营、鼠标移动、雪球攻击、多方向人物以及雪人保护等。

本项目不是可乐8官方项目，也不主张拥有原游戏品牌、角色、商标或其他受保护内容。提及“可乐8 / 打雪仗”仅用于说明历史玩法灵感来源。

如果你认为仓库中的任何内容可能涉及权利问题，欢迎提交 Issue，我们可以进行检查和替换。

## 参与贡献

欢迎 Issue 和 Pull Request。适合继续完善的方向包括：

- 移动 / 镜头手感与网络延迟优化
- Sprite 对齐、跑步和投雪球动画
- 随机地图与机器人策略
- 房间 / 回合 / 比赛结算
- 移动端触摸控制
- 音效与更多战斗反馈

## 开源协议

本项目使用 **MIT License**：[`LICENSE`](./LICENSE)

协议说明 / 译文：

- [简体中文 MIT 说明](./LICENSE.zh-CN.md)
- [日本語 MIT 説明](./LICENSE.ja.md)

具有法律效力的许可文本以英文 `LICENSE` 为准。



---

<table>
  <tr>
    <th align="center">加微信交流</th>
    <th align="center">支持开源（微信）</th>
    <th align="center">支持开源（支付宝）</th>
  </tr>
  <tr>
    <td align="center"><img src="examples/weixin.jpg" alt="加微信交流" height="320"></td>
    <td align="center"><img src="examples/paywx.jpg" alt="微信支持开源" height="320"></td>
    <td align="center"><img src="examples/payalipay.jpg" alt="支付宝支持开源" height="320"></td>
  </tr>
</table>

### 关注我们

<table>
  <tr>
    <th align="center">公众号</th>
    <th align="center">视频号</th>
    <th align="center">抖音</th>
  </tr>
  <tr>
    <td align="center"><img src="examples/qr_gzh.jpg" alt="关注 AISolo大西瓜公众号" height="320"></td>
    <td align="center"><img src="examples/qr_sph.jpg" alt="关注 AISolo大西瓜视频号" height="320"></td>
    <td align="center"><img src="examples/qr_dy.jpg" alt="关注 AISolo大西瓜抖音" height="320"></td>
  </tr>
</table>