# RTF1 message format

The public page `/mortgage-calculator/` does not calculate anything. On submit it opens WhatsApp with one text message. A parser in remal-calc should read that message and nothing else: the site does not post the fields to a server.

## Wire format

- URL: `https://wa.me/966535330034?text=<percent-encoded message>`
- The `text` value is the message below, encoded with `encodeURIComponent` (UTF-8). Spaces are `%20`, newlines are `%0A`, `#` is `%23`. Do not treat `+` as a space.
- The message is UTF-8 text. Line separator is `\n` only. There is no trailing newline.
- First line is exactly `#RTF1` with no spaces.
- Each following line is `key: value` (colon, then one space, then the value).
- Keys use the fixed list below, in that order. A missing optional value drops the whole line, so line numbers move. Match on the key, not on the position.
- Values do not contain raw newlines. Digits are Western (`0-9`), with no grouping separators and no currency word.
- Dates are `YYYY-MM-DD`.
- `الالتزامات` is present only when both numbers are present, including zero: `<amount> / <months>` (spaces around the slash).
- `قرض الدفاع` is present only when `القطاع` is `عسكري` and the answer is `نعم` or `لا`. For any other sector the line is absent even if a value was entered.
- `سكني` is `نعم` or `لا`. If the visitor left it unanswered, the line is absent.
- Empty optional lines are omitted. The four lines the form requires before it will open WhatsApp are `الاسم`, `الراتب الصافي`, `القطاع`, and `تاريخ الميلاد`.

## Keys

| Order | Key | Value |
| --- | --- | --- |
| 1 | الاسم | Text, 2–80 characters |
| 2 | الراتب الصافي | Integer riyals, 1000–500000 |
| 3 | الراتب الأساسي | Integer riyals, 0–500000, optional |
| 4 | القطاع | `حكومي مدني` or `عسكري` or `خاص` or `متقاعد` |
| 5 | الرتبة/الوظيفة | Text, optional |
| 6 | تاريخ الميلاد | `YYYY-MM-DD`. Age on the day of submission is 18–75 |
| 7 | تاريخ التعيين | `YYYY-MM-DD`, optional, not in the future, not before age 15 |
| 8 | بنك الراتب | Free text the visitor typed, optional. The page has no bank list |
| 9 | الالتزامات | `<amount> / <months>`. Amount 0–500000 riyals. Months 0–360 |
| 10 | سكني | `نعم` or `لا`, optional |
| 11 | قرض الدفاع | `نعم` or `لا`, only with القطاع `عسكري` |
| 12 | الدفعة | Integer riyals, 0–500000000, optional |
| 13 | سعر العقار | Integer riyals, 1–500000000, optional |
| 14 | نوع العقار | `فيلا` or `شقة` or `دور` or `أرض` or `عمارة` or `أخرى`, optional |
| 15 | المدينة/الحي | Text, optional |

`نوع العقار` is part of this fixed order. It sits after `سعر العقار` and before `المدينة/الحي`.

Client checks that reject a submission (the message is then not opened): salary outside the ranges above, a down payment greater than the property price, an incomplete obligations pair, and a hire date before the 15th birthday.

## Example, all lines

```
#RTF1
الاسم: محمد عبدالله القحطاني
الراتب الصافي: 14500
الراتب الأساسي: 9800
القطاع: عسكري
الرتبة/الوظيفة: رقيب
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

Encoded, the URL starts:

```
https://wa.me/966535330034?text=%23RTF1%0A%D8%A7%D9%84%D8%A7%D8%B3%D9%85%3A%20...
```

## Example, required lines only

Optional lines are omitted. `قرض الدفاع` is omitted because the sector is not عسكري.

```
#RTF1
الاسم: سارة علي
الراتب الصافي: 9000
القطاع: خاص
تاريخ الميلاد: 1995-06-01
المدينة/الحي: أبها
```
