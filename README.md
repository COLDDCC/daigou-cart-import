# daigou-cart-import

客户以前的流程：把商品链接一条条发给你 → 你手动打开每个链接 → 手动加入购物车 → 一起下单。
东西一多，这一步就是纯体力活。

这个仓库做的事：客户把商品信息填进一张表格（Google Sheets 等），提交表格的分享链接；
脚本自动拉取表格、解析每一行、校验链接格式、按客户 ID 写入购物车，重复提交/合并数量都是安全的，不会加出重复行。

## 现状：原型，不是生产系统

`src/cartStore.mjs` 里的 `CartStore` 目前是一个本地 JSON 文件（`data/carts.json`），
用来模拟"购物车"这张表，方便先把「表格 → 解析 → 入库」这条链路跑通、写测试。
接入真正的代购平台时，只需要把这个类换成调用你们后端 API 或数据库的实现，
`addItems(customerId, items, sourceSheetUrl)` / `getCart(customerId)` 这两个方法签名不用变，
`importSheet.mjs` 里的其它逻辑完全不用动。

## 表格格式

支持中英文表头（大小写不敏感），按下面几种含义识别列，不要求列顺序：

| 含义 | 支持的表头 |
| --- | --- |
| 商品链接（必填） | 商品链接 / 链接 / url / link / 商品url / product link |
| 数量（选填，默认 1） | 数量 / qty / quantity / 件数 |
| 规格（选填） | 规格 / sku / variant / 颜色尺码 / options |
| 备注（选填） | 备注 / note / remark / 说明 |

行为：
- 链接缺失或格式不合法 → 跳过该行，打印警告，不中断整体导入。
- 数量缺失或非法 → 按 1 处理，打印警告。
- 同一客户对同一「链接+规格」重复提交 → 合并数量，不会重复加入购物车。这意味着客户改完表格重新发一次链接也是安全的。

Google Sheets 需要设置成「知道链接的任何人可查看」，脚本会自动把编辑链接转换成 CSV 导出链接。

## 使用

```bash
node src/importSheet.mjs --sheet "<客户发来的表格链接>" --customer "<客户ID>"

# 自定义购物车数据文件位置（默认 data/carts.json）
node src/importSheet.mjs --sheet "<表格链接>" --customer "<客户ID>" --out ./data/carts.json
```

## 测试

```bash
node test/run-tests.mjs
```

覆盖：CSV 解析（含引号/逗号/换行）、Google Sheets 链接转换、缺失或非法字段的校验与警告文案、
端到端导入 + 去重合并 + 重复提交不产生重复行。

## 下一步（不在这一版范围内）

- 把 `CartStore` 换成真正的代购平台后端（API 或数据库）。
- 加一个提交入口（客户填链接的网页表单/webhook），触发自动导入，而不是手动跑命令行。
- 如果需要自动识别商品标题/价格/图片，需要针对具体电商网站再做抓取，这是完全独立的一块，风险和复杂度都高很多，建议先不做。
