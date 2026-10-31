# Модели и материалы «Незваных гостей»

Все перечисленные ассеты скачаны с **Poly Haven** и распространяются по **CC0 1.0 Universal**.
- Условия: https://polyhaven.com/license
- CC0: https://creativecommons.org/publicdomain/zero/1.0/
- Это независимая игра, не продукт и не официальная рекомендация Poly Haven.

## Готовые модели (glTF, PBR-текстуры 1K)

| В игре | Ассет / страница источника | Автор |
| --- | --- | --- |
| Стул | https://polyhaven.com/a/painted_wooden_chair_01 | Kuutti Siitonen |
| Стол | https://polyhaven.com/a/wooden_table_02 | Serhii Khromov |
| Телевизор | https://polyhaven.com/a/Television_01 | Gabriel Radić |
| Ваза | https://polyhaven.com/a/ceramic_vase_01 | James Ray Cock |
| Коробка | https://polyhaven.com/a/cardboard_box_01 | Rahul Chaudhary |
| Диван | https://polyhaven.com/a/sofa_02 | Kirill Sannikov |
| Шкаф | https://polyhaven.com/a/painted_wooden_cabinet | Kirill Sannikov |
| Потолочный светильник | https://polyhaven.com/a/modern_ceiling_lamp_01 | James Ray Cock |
| Молоток в руке | https://polyhaven.com/a/wooden_hammer_01 | James Ray Cock |

## PBR-поверхности (2K)

| Применение | Источник | Автор |
| --- | --- | --- |
| Деревянный пол | https://polyhaven.com/a/old_wood_floor | Guillaume Monsergent |
| Штукатурка стен и потолка | https://polyhaven.com/a/grey_plaster_03 | Rob Tuytel |

Геометрия и исходные текстуры не изменены. В игре используются равномерное масштабирование, поворот, оттенки поверхностей и повторение текстур. Аквариум, пауки с анимацией лап, оконные рамы, шторы, радиаторы, рука и остальные пять инструментов — собственная процедурная геометрия, не сторонние модели.

`manifest.json` содержит авторов, URL каждого исходного файла, размер и SHA-256. Игра обращается только к локальным копиям; API Poly Haven нужен лишь для ручного запуска `node scripts/download-assets.mjs`. Скрипт проверяет контрольные суммы и не перезаписывает отличающиеся локальные файлы. Общий объём графических ресурсов — около 22,8 МиБ.
