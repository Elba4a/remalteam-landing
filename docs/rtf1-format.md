# RTF1 message format

The public page `/mortgage-calculator/` does not calculate anything. On submit it opens WhatsApp with one text message. A separate button opens WhatsApp with a short greeting that does not start with `#RTF1`. A parser in remal-calc should read only messages whose first line is `#RTF1`. The site does not post the fields to a server.

## Wire format

- URL: `https://wa.me/966535330034?text=<percent-encoded message>`
- The `text` value is the message below, encoded with `encodeURIComponent` (UTF-8). Spaces are `%20`, newlines are `%0A`, `#` is `%23`. Do not treat `+` as a space.
- The message is UTF-8 text. Line separator is `\n` only. There is no trailing newline.
- First line is exactly `#RTF1` with no spaces.
- Each following line is `key: value` (colon, then one space, then the value).
- Keys use the fixed list below, in that order. A field the visitor left empty drops the whole line, so line numbers move. Match on the key, not on the position.
- Values do not contain raw newlines. Digits are Western (`0-9`), with no grouping separators and no currency word.
- Dates are `YYYY-MM-DD`.
- `رقم الجوال` is `9665XXXXXXXX` (12 digits, no plus). The form accepts `05XXXXXXXX` or `+9665XXXXXXXX`, and also `9665XXXXXXXX` or `009665XXXXXXXX`, then normalises.
- `الالتزامات` is present only when both numbers are present, including zero: `<amount> / <months>` (spaces around the slash).
- `قرض الدفاع` is present only when `جهة العمل` is `عسكري` and the answer is `نعم` or `لا`. For any other employer the line is absent even if a value was entered.
- `سكني` is `نعم` or `لا`. If the visitor left it unanswered, the line is absent.
- Only filled fields appear. The four lines the form requires before it will open the `#RTF1` message are `الاسم`, `رقم الجوال`, `جهة العمل`, and `الراتب تقريباً`.

## Keys

| Order | Key | Required | Value |
| --- | --- | --- | --- |
| 1 | الاسم | yes | Text, 2–80 characters |
| 2 | رقم الجوال | yes | `9665XXXXXXXX` |
| 3 | جهة العمل | yes | `حكومي` or `عسكري` or `خاص` or `متقاعد` |
| 4 | الراتب تقريباً | yes | Integer riyals, 1000–500000 |
| 5 | تاريخ الميلاد | no | `YYYY-MM-DD`. If sent, age that day is 18–75 |
| 6 | تاريخ التعيين | no | `YYYY-MM-DD`, not in the future, not before age 15 when birth date is sent |
| 7 | بنك الراتب | no | Free text the visitor typed. The page has no bank list |
| 8 | الالتزامات | no | `<amount> / <months>`. Amount 0–500000 riyals. Months 0–360 |
| 9 | سكني | no | `نعم` or `لا` |
| 10 | قرض الدفاع | no | `نعم` or `لا`, only with جهة العمل `عسكري` |
| 11 | الدفعة | no | Integer riyals, 0–500000000 |
| 12 | سعر العقار | no | Integer riyals, 1–500000000 |
| 13 | نوع العقار | no | `فيلا` or `شقة` or `دور` or `أرض` or `عمارة` or `أخرى` |
| 14 | المدينة/الحي | no | Text |

جهة العمل is the employer, and its values are حكومي, عسكري, خاص, and متقاعد. الراتب تقريباً is the approximate monthly salary. Basic salary and job title are not collected.

Client checks that reject a submission (the `#RTF1` message is then not opened): a mobile that is not a Saudi `05` / `+9665` number, a salary outside 1000–500000, a down payment greater than the property price, an incomplete obligations pair, and a hire date before the 15th birthday.

## Example, all lines

```
#RTF1
الاسم: محمد عبدالله القحطاني
رقم الجوال: 966551234567
جهة العمل: عسكري
الراتب تقريباً: 14500
تاريخ الميلاد: 1992-03-14
تاريخ التعيين: 2014-08-01
بنك الراتب: اسم البنك
الالتزامات: 1800 / 24
سكني: نعم
قرض الدفاع: لا
الدفعة: 80000
سعر العقار: 750000
نوع العقار: فيلا
المدينة/الحي: خميس مشيط / الواحة
```

The mobile above is what `0551234567` and `+966551234567` both become.

Encoded, the URL starts:

```
https://wa.me/966535330034?text=%23RTF1%0A%D8%A7%D9%84%D8%A7%D8%B3%D9%85%3A%20...
```

## Example, required lines only

Optional lines are omitted. `قرض الدفاع` is omitted because جهة العمل is not عسكري.

```
#RTF1
الاسم: سارة علي
رقم الجوال: 966512345678
جهة العمل: خاص
الراتب تقريباً: 9000
```

## Direct button, not RTF1

The page also links to `https://wa.me/966535330034?text=...` with this greeting, which does not start with `#RTF1`:

```
السلام عليكم، أبغى مساعدة في التمويل.
```

Ignore that greeting in the parser.
