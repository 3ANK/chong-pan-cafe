import csv, io, json
from pathlib import Path
root = Path(__file__).resolve().parents[1]
data = json.loads((root / "menu.json").read_text(encoding="utf-8"))
assert sum(len(c["items"]) for c in data["categories"]) == data["item_count"]
counts = {g: sum(len(c["items"]) for c in data["categories"] if c["group"] == g) for g in ["อาหาร", "ขนม", "เครื่องดื่ม"]}
lines = ["# ชื่อเมนูและราคา — ชง&ปั่น", "", "ตรวจสอบล่าสุด: " + data["verified_date"] + " (Asia/Bangkok)", "", f"รวม {data['item_count']} รายการ: อาหาร {counts['อาหาร']} · ขนม {counts['ขนม']} · เครื่องดื่ม/ท็อปปิง/น้ำแข็ง {counts['เครื่องดื่ม']}", "", "ราคาฐานหน่วยบาท ยังไม่รวมตัวเลือกที่มีค่าใช้จ่ายเพิ่ม ข้อมูลจากหน้าสั่งอาหารและรายการเพิ่มเติมที่เจ้าของร้านแจ้ง", "", "[หน้าสั่งอาหาร](" + data["source_url"] + ") · [สั่งผ่าน LINE](" + data["ordering_url"] + ") · [JSON](menu.json) · [CSV](menu.csv)", "", "> " + data["update_policy"], ""]
buf = io.StringIO(); writer = csv.writer(buf)
writer.writerow(["ประเภท", "หมวด", "ชื่อเมนู", "ราคา (บาท)", "หมายเหตุ"])
for group in ["เครื่องดื่ม", "อาหาร", "ขนม"]:
 lines += ["## " + group, ""]
 for c in data["categories"]:
  if c["group"] != group: continue
  lines += ["### " + c["category"], "", "| ชื่อเมนู | ราคา (บาท) | หมายเหตุ |", "|---|---:|---|"]
  for i in c["items"]:
   assert isinstance(i["price_thb"], int) and i["price_thb"] > 0
   note = i.get("note", "")
   lines.append(f"| {i['name']} | {i['price_thb']} | {note} |")
   writer.writerow([group,c["category"],i["name"],i["price_thb"],note])
  lines.append("")
(root / "MENU.md").write_text("\n".join(lines), encoding="utf-8")
(root / "menu.csv").write_text(buf.getvalue(), encoding="utf-8-sig")
print("Exported", data["item_count"], "menu items")

