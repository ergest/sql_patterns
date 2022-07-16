## Introduction
Welcome to Part 2 of the series on the Activity Schema, a new way to model data for modern warehouses that relies on a single time-series table. In Part 1 of the series we covered the basics of how to set up the table and how to load the activities onto it. In this part we'll start to look into querying this table.

Querying such a table is very different than the traditional way of using keys. Since activities for the customer are strung together in time, the relations amongst them are temporal in nature. When you join one or many activities, you're essentially figuring out how to link them with each other by using the customer id and the timestamp.

Let's take a look at an example. 

```
ts                     |activity         |customer|activity_repeated_at   |
-----------------------+-----------------+--------+-----------------------+
2020-10-21 20:27:08.000|started_session  |12345   |2020-11-16 14:41:27.000|
2020-10-25 16:39:51.000|started_checkout |12345   |2020-11-17 17:50:13.000|
2020-10-28 15:19:33.000|completed_order  |12345   |2020-11-17 18:15:13.000|
2020-10-28 15:36:05.000|shipped_order    |12345   |                       |
2020-11-16 14:41:27.000|started_session  |12345   |                       |
2020-11-17 17:50:13.000|started_checkout |12345   |                       |
2020-11-17 18:15:13.000|completed_order  |12345   |                       |
```

As you can see this customer's journey begins by starting a web session (assuming of course we've identified them, more on that later) and then a few days later they start a checkout, complete the order and it gets shipped. Then they start another web session a few weeks later.

This is what an ActivitySchema is supposed to look like. We've stitched together activities from multiple tools (web logging and Shopify) into a singular customer view with a conformed schema. This allows us to answer almost any question about the customer as long as it can be phrased in a temporal relationship.

## Temporal Relationships
In order to stitch activities together in time we have to join them through the customer, activity and timestamp fields and we can then pivot the features out into their own columns in order to enrich our data set. There are 11 such relationships and we'll cover each one separately.

1.  First ever
2.  First before
3.  First after
4.  First in between
5.  Last ever
6.  Last before
7.  Last in between
8.  Aggregate all ever
9.  Aggregate before
10.  Aggregate after
11.  Aggregate in between

The way you join activities together is by starting with a base activity (your initial cohort) and you append other activities to it based on whether those activities occurred before all the base activities, after all the base activities or in between them and whether we care about the first occurrence or the last occurrence.

In this part we're going to cover the *First Ever* and *Last Ever* relationships. The *First Ever* relationship means that you attach the first occurrence of that activity to the cohort you start with regardless of when that base activity happened. The same happens with the *Last Ever*, you attach the last activity that happened regardless of when it happened.

These can be very useful when you want to do say first-touch or last-touch attribution for a customer. In this case your cohort is everyone who has a `completed_order` activity and you join or append to that the first occurrence of a `stated_session` activity.


