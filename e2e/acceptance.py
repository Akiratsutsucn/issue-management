"""MVP 验收单端到端脚本（Playwright，Python）。

只对独立测试实例运行，不要指向正式库。
用法：
  set E2E_BASE=http://host:port
  set E2E_EMAIL=admin@test.local
  set E2E_PASSWORD=...（不要写进文件）
  set E2E_OUT=截图与下载输出目录
  python -I e2e/acceptance.py
"""
import io
import os
import re
import struct
import sys
import zlib
import zipfile

from playwright.sync_api import expect, sync_playwright

BASE = os.environ["E2E_BASE"].rstrip("/")
EMAIL = os.environ["E2E_EMAIL"]
PASSWORD = os.environ["E2E_PASSWORD"]
OUT = os.environ.get("E2E_OUT", "e2e-out")
os.makedirs(OUT, exist_ok=True)
results: list[tuple[str, bool, str]] = []


def check(name: str, ok: bool, note: str = "") -> None:
    results.append((name, ok, note))
    print(("PASS " if ok else "FAIL ") + name + (f" — {note}" if note else ""), flush=True)


def png_bytes() -> bytes:
    def chunk(t: bytes, d: bytes) -> bytes:
        return struct.pack(">I", len(d)) + t + d + struct.pack(">I", zlib.crc32(t + d) & 0xFFFFFFFF)
    raw = b"".join(b"\x00" + bytes([0xE8, 0x89, 0x8A]) * 8 for _ in range(8))
    return b"\x89PNG\r\n\x1a\n" + chunk(b"IHDR", struct.pack(">IIBBBBB", 8, 8, 8, 2, 0, 0, 0)) + chunk(b"IDAT", zlib.compress(raw)) + chunk(b"IEND", b"")


def write(name: str, data: bytes) -> str:
    p = os.path.join(OUT, name)
    with open(p, "wb") as f:
        f.write(data)
    return p


def xlsx_text(path: str) -> str:
    with zipfile.ZipFile(path) as z:
        return "".join(z.read(n).decode("utf-8", "ignore") for n in z.namelist() if n.endswith(".xml"))


def make_import_xlsx() -> str:
    from openpyxl import Workbook

    wb = Workbook()
    ws = wb.active
    ws.title = "課題管理"
    ws.append(["客先", "导入测试客户"])
    ws.append(["会谈", "2026-10-20 会谈", "更新日", 46325])
    ws.append(["更新者", "测试"])
    ws.append(["会谈信息", "线上"])
    ws.append(["填写口径", "原话"])
    ws.append(["番号", "課題タイトル", "優先度", "完了条件", "記載日", "起票者", "担当者", "詳細", None, "期限", "状態"])
    ws.append([None, None, None, None, None, None, None, "問題点", "解決案", None, None])
    ws.append([1, "导入课题一", "高", "完成", 46315, "李", "管理员", "问题一", "方案一", 46324, "已回答"])
    ws.append([2, None, "中", None, "2026/10/21", None, None, "见本表第1项", None, None, "处理中"])
    buf = io.BytesIO()
    wb.save(buf)
    return write("import-test.xlsx", buf.getvalue())


def new_issue(page, customer: str, title: str, *, high=False, no_assignee=False, image: str | None = None, note=""):
    page.goto(f"{BASE}/issues/new")
    page.select_option("select[name=customerId]", label=customer)
    page.fill("input[name=title]", title)
    if high:
        page.select_option("select[name=priorityId]", label="高")
    if no_assignee:
        for cb in page.locator("input[name=assigneeIds]").all():
            cb.uncheck()
    editors = page.locator(".editor")
    # 顺序：完了条件、問題点、解決案、内部备注
    editors.nth(0).locator(".ProseMirror").fill("客户确认迁移完成")
    editors.nth(1).locator(".ProseMirror").fill("第一轮问题")
    if image:
        editors.nth(1).locator("input[type=file]").set_input_files(image)
        expect(editors.nth(1).locator("img")).to_have_count(1, timeout=15000)
    if note:
        editors.nth(3).locator(".ProseMirror").fill(note)
    page.click("button[value=open]")
    page.wait_for_url(re.compile(r"/issues/c[a-z0-9]+$"))
    return page.url


def main() -> int:
    png = write("evidence.png", png_bytes())
    fake_video = write("clip.mp4", b"\x00\x00\x00\x20ftypisom" + b"\x00" * 64)
    with sync_playwright() as p:
        browser = p.chromium.launch(channel=os.environ.get("E2E_CHANNEL") or None)
        ctx = browser.new_context(accept_downloads=True, viewport={"width": 1440, "height": 960}, locale="zh-CN")
        page = ctx.new_page()

        page.goto(f"{BASE}/login")
        page.screenshot(path=os.path.join(OUT, "01-login.png"))
        page.fill("input[name=email]", EMAIL)
        page.fill("input[name=password]", PASSWORD)
        page.click("button[type=submit]")
        page.wait_for_url(f"{BASE}/")

        # 1 空库启动
        empty = page.get_by_text("还没有课题").is_visible() and page.get_by_role("link", name="新建课题").first.is_visible()
        page.screenshot(path=os.path.join(OUT, "02-empty-overview.png"))
        page.goto(f"{BASE}/customers")
        check("1 空库启动：无课题、无客户，主行动为新建课题", empty and page.get_by_text("还没有客户").is_visible())

        # 2 两个客户，番号各自从 1 起
        for name in ["测试客户甲", "测试客户乙"]:
            page.goto(f"{BASE}/customers")
            page.locator("details.card summary").click() if not page.locator("input[name=name]").is_visible() else None
            page.fill("input[name=name]", name)
            page.get_by_role("button", name="新建客户").click()
            page.wait_for_url(re.compile(r"/customers/c[a-z0-9]+$"))

        # 3 手工建题（11 列 + 扩展，图文，内部备注）
        url_a = new_issue(page, "测试客户甲", "账号整合", image=png, note="INTERNAL-SECRET-备注")
        page.screenshot(path=os.path.join(OUT, "03-issue-detail.png"), full_page=True)
        has_img = page.locator(".rich img").count() > 0
        url_b = new_issue(page, "测试客户乙", "", high=True, no_assignee=True)
        seq_b = page.locator("h1.issue-title .num").inner_text()
        page.goto(url_a)
        seq_a = page.locator("h1.issue-title .num").inner_text()
        check("2 两个客户番号各自从 1 起", seq_a == "#1" and seq_b == "#1", f"{seq_a} / {seq_b}")
        check("3 问题点可插入图片并预览", has_img)

        # 4 拒绝音视频
        page.locator(".card", has=page.get_by_role("heading", name="证据")).locator("input[type=file]").set_input_files(fake_video)
        av_msg = page.get_by_text("本系统不支持视频或语音文件")
        expect(av_msg).to_be_visible(timeout=10000)
        check("4 视频/音频被拒绝并说明", av_msg.is_visible() and page.locator("video, audio").count() == 0)

        # 5 追加第二轮问题，首轮保留
        sec = page.locator("section", has=page.get_by_role("heading", name="问题点"))
        sec.get_by_role("button", name="追加问题").click()
        sec.locator(".ProseMirror").fill("第二轮追问")
        sec.get_by_role("button", name="追加问题").click()
        expect(sec.get_by_text("第二轮追问")).to_be_visible(timeout=10000)
        sec.get_by_text("展开历史").click()
        check("5 追加后首轮问题点仍在历史中", sec.get_by_text("第一轮问题").is_visible())

        # 6 关联并双向跳转
        link_form = page.locator("section", has=page.get_by_role("heading", name="关联课题"))
        link_form.locator("select[name=customerId]").select_option(label="测试客户乙")
        link_form.locator("input[name=seq]").fill("1")
        link_form.get_by_role("button", name="关联").click()
        expect(link_form.get_by_text("取消关联")).to_be_visible(timeout=10000)
        page.goto(url_b)
        back = page.locator("section", has=page.get_by_role("heading", name="关联课题")).locator("a[href^='/issues/']")
        check("6 两条课题互相关联、双向可见", back.count() == 1)

        # 8 完成门禁
        page.goto(url_a)
        def set_status(label: str):
            page.select_option("select[name=to]", label=f"改为「{label}」")
            page.locator("aside").get_by_role("button", name="确定").click()
        head = page.locator(".page-head")
        set_status("已回答")
        expect(head.get_by_text("已回答")).to_be_visible(timeout=10000)
        set_status("待客户确认")
        expect(head.get_by_text("待客户确认")).to_be_visible(timeout=10000)
        set_status("已完成")
        blocked = page.get_by_text("未满足完成条件")
        expect(blocked).to_be_visible(timeout=10000)
        missing_ok = page.get_by_text("缺少至少一份证据").is_visible()
        page.screenshot(path=os.path.join(OUT, "04-gate-blocked.png"), full_page=True)
        page.locator(".card", has=page.get_by_role("heading", name="证据")).locator("input[type=file]").set_input_files(png)
        expect(page.locator(".thumb img")).to_have_count(1, timeout=15000)
        page.reload()
        conf = page.locator("section", has=page.get_by_role("heading", name="客户确认"))
        if not conf.locator("input[name=name]").is_visible():
            conf.locator("summary").click()
        conf.locator("input[name=name]").fill("客户张经理")
        conf.locator("input[name=method]").fill("会谈")
        conf.get_by_role("button", name="保存确认").click()
        expect(conf.locator("p").get_by_text("客户张经理")).to_be_visible(timeout=10000)
        page.reload()
        set_status("已完成")
        page.wait_for_timeout(1500)
        page.reload()
        done = page.locator(".page-head").get_by_text("已完成").is_visible()
        check("8 无证据拒绝完成；补证据与客户确认后可完成", missing_ok and done)

        # 9 提醒
        page.goto(f"{BASE}/reminders")
        page.get_by_role("button", name="立即检查").click()
        page.wait_for_timeout(1500)
        page.reload()
        rem = page.get_by_text("高优先缺担当").first.is_visible()
        page.screenshot(path=os.path.join(OUT, "05-reminders.png"), full_page=True)
        check("9 高优先无担当出现在提醒中心", rem)

        # 10 概览与列表一致（未完结）
        page.goto(f"{BASE}/")
        kpi = page.locator(".kpi.lead .value").inner_text()
        page.screenshot(path=os.path.join(OUT, "06-overview.png"), full_page=True)
        page.goto(f"{BASE}/issues")
        sub = page.locator(".page-head .sub").inner_text()
        check("10 概览未完结数与列表一致", sub.endswith(f"{kpi} 条"), f"概览 {kpi}，列表「{sub}」")
        page.screenshot(path=os.path.join(OUT, "07-issue-list.png"), full_page=True)

        # 3/11 导出
        page.goto(url_a)
        cust_href = page.locator(".crumbs a").nth(1).get_attribute("href")
        cust_id = cust_href.rsplit("/", 1)[-1]
        resp = page.request.get(f"{BASE}/api/export/customer/{cust_id}?forCustomer=1")
        p1 = write("export-customer.xlsx", resp.body())
        t1 = xlsx_text(p1)
        cols = ["番号", "課題タイトル", "優先度", "完了条件", "記載日", "起票者", "担当者", "問題点", "解決案", "期限", "状態"]
        check("11 按客户导出找回 11 列", all(c in t1 for c in cols))
        check("3 对客户导出不含内部备注", "INTERNAL-SECRET" not in t1 and "内部备注" not in t1)

        # 12 导入
        page.goto(f"{BASE}/import")
        page.set_input_files("input[name=file]", make_import_xlsx())
        page.get_by_role("button", name="上传并预览").click()
        page.wait_for_url(re.compile(r"job="))
        prev = page.content()
        serial_ok = "2026-10-29" in prev and "标题待补" in prev
        page.screenshot(path=os.path.join(OUT, "08-import-preview.png"), full_page=True)
        page.once("dialog", lambda d: d.accept())
        page.get_by_role("button", name="确认导入").click()
        expect(page.get_by_text("导入结果")).to_be_visible(timeout=20000)
        report = page.locator("section.card").first.inner_text()
        check("12 自制 Excel 导入：序列日期、缺标题、结果与预览一致", serial_ok and "创建 2" in report.replace("\n", " ").replace("  ", " "), report.strip().replace("\n", " "))

        # 7 导入已回答保持已回答
        page.goto(f"{BASE}/issues?status=answered")
        check("7 导入「已回答」保持已回答", page.get_by_text("导入课题一").is_visible())

        # 13 操作日志
        page.goto(f"{BASE}/audit")
        log = page.content()
        check("13 操作日志有创建、状态变更", "创建课题" in log and "已回答" in log)

        # 14 页面无明文密码
        check("14 页面源码不含密码", PASSWORD not in log and PASSWORD not in prev)
        browser.close()

    failed = [r for r in results if not r[1]]
    print(f"\n{len(results) - len(failed)}/{len(results)} 通过")
    return 1 if failed else 0


if __name__ == "__main__":
    sys.exit(main())
