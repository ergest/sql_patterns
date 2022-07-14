## Introduction
Welcome to Part 2 of the series on the Activity Schema, a new way to model data for modern warehouses that relies on a single time-series table. In Part 1 of the series we covered the basics of how to set up the table and how to load the activities onto it. In this part we'll start to look into querying this table.

Querying such a table is very different than the traditional way of using keys. Since activities for the customer are strung together in time, the relations amongst them are temporal in nature. When you join one or many activities, you're essentially figuring out how to link them with each other by using the customer id and the timestamp.

Let's take a look at an example. 

```
ts                     |activity         |customer|activity_repeated_at   |
-----------------------+-----------------+--------+-----------------------+
2020-10-21 20:27:08.000|started_session  |12345   |2021-09-21 10:39:20.000|
2020-10-25 16:39:51.000|started_checkout |12345   |2020-11-16 14:41:27.000|
2020-10-28 15:19:33.000|completed_order  |12345   |2020-10-28 15:36:05.000|
2020-10-28 15:36:05.000|shipped_order    |12345   |2020-11-17 17:50:13.000|
2020-11-16 14:41:27.000|completed_order  |12345   |2020-11-26 22:02:18.000|
2020-11-16 14:41:29.000|purchased_product|12345   |2021-02-27 08:06:45.000|
2020-11-17 17:50:13.000|shipped_order    |12345   |2020-12-02 20:04:50.000|
2020-11-17 17:50:13.000|shipped_product  |12345   |2020-12-02 20:04:50.000|
```