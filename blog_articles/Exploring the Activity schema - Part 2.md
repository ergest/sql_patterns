## Introduction
Welcome to Part 2 of the series on the [ActivitySchema](https://www.activityschema.com), a new way to model data for modern warehouses that relies on a single time-series table. In Part 1 of the series we covered the basics of how to set up the table and how to load the activities onto it. In this part we'll start to look into querying this table.

Querying such a table is very different than the traditional way of using keys. Since activities for the customer are strung together in time, the relations amongst them are temporal in nature. When you join one or many activities, you're essentially figuring out how to link them with each other by using the customer id and the timestamp.

Let's take a look at an example. 

```
ts                 |activity         |customer|activity_repeated_at|
-------------------+-----------------+--------+--------------------+
2020-10-21 20:27:08|started_session  |12345   |2020-11-16 14:41:27 |
2020-10-25 16:39:51|started_checkout |12345   |2020-11-17 17:50:13 |
2020-10-28 15:19:33|completed_order  |12345   |2020-11-17 18:15:13 |
2020-10-28 15:36:05|shipped_order    |12345   |                    |
2020-11-16 14:41:27|started_session  |12345   |                    |
2020-11-17 17:50:13|started_checkout |12345   |                    |
2020-11-17 18:15:13|completed_order  |12345   |                    |
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

In this part we're going to cover the **First Ever* and *Last Ever* relationships. The *First Ever* relationship means that you attach the first occurrence of that activity to the cohort you start with regardless of when that base activity happened. The same happens with the *Last Ever*, you attach the last activity that happened regardless of when it happened.

These can be very useful when you want to do say first-touch or last-touch attribution for a customer. In this case your cohort is everyone who has a `completed_order` activity and you join or append to that the first occurrence of a `stated_session` activity.

You can see in results above that customer `12345` started a session on `2020-10-21 20:27:08`  and then another one on `2020-11-16 14:41:27` They also completed two orders. So if I was doing a *First Ever* relationship, I would start with the `completed_order` activity as my cohort like this:
```sql
with cohort as (
    select
        activity_id,
        datetime(ts, 'America/New_York') as activity_timestamp,
        activity,
        customer,
        activity_occurrence,
        feature_1,
        feature_2,
        feature_3,
        ts                   as join_ts,
        activity_id          as join_cohort_id,
        customer             as join_customer,
        activity_repeated_at as join_cohort_next_ts
    from
        my_data.customer_stream 
    where
        activity = 'completed_order'
    order by
        ts desc
)
```

This would get me both order completed activities:
```
ts                 |activity         |customer|
-------------------+-----------------+--------+
2020-10-28 15:19:33|completed_order  |12345   |
2020-11-17 18:15:13|completed_order  |12345   |
```

Then I would grab the first ever `session_started` like this:
```sql
first_ever_checkout_started as (
    select
        join_customer,
        join_cohort_id,
        min(cs.ts) as first_session_started_at
    from
        cohort c
        inner join my_data.customer_stream cs
            on c.join_customer = cs.customer
    where
        cs.activity = 'session_started'
    group by
        1,2
)
```

Then if I wanted to grab all the features of the `session_started` activity, all I'd need to do is join that activity on customer and timestamp like this:
```sql
first_ever_session_started_features as (
    select
        fe.join_customer,
        fe.join_cohort_id,
        fe.first_session_started_at,
        s.activity,
        s.feature_1,
        s.feature_2,
        s.feature_3,
        s.link
    from
        my_data.customer_stream s
        inner join first_ever_session_started fe
            on s.customer = fe.join_customer
            and s.ts = fe.first_session_started_at
    where 
        s.activity = 'session_started'
)
```

Finally, I would join the two and pivot out the features that I wanted like this:
```sql
select
    c.activity_timestamp,
    c.customer,
    c.activity,
    c.activity_occurrence,
    c.feature_1,
    c.feature_2,
    c.feature_3,
    datetime(fe.first_session_started_at, 'America/New_York') as first_session_started_at,
    fe.activity,
    fe.feature_1,
    fe.feature_2,
    fe.feature_3,
    fe.link
from
    cohort c
    left outer join first_ever_session_started_features fe
        on c.join_customer = fe.join_customer
        and c.join_cohort_id = fe.join_cohort_id;
```

This final query would repeat the features of the first ever `session_started` activity for every `order_completed` activity which would allow us to perform the right attribution.

Here's the full query:
```sql
--first ever
with cohort as (
    select
        activity_id,
        datetime(ts, 'America/New_York') as activity_timestamp,
        activity,
        customer,
        activity_occurrence,
        feature_1,
        feature_2,
        feature_3,
        ts                   as join_ts,
        activity_id          as join_cohort_id,
        customer             as join_customer,
        activity_repeated_at as join_cohort_next_ts
    from
        my_data.customer_stream 
    where
        activity = 'completed_order'
    order by
        ts desc
),
first_ever_session_started as (
    select
        join_customer,
        join_cohort_id,
        min(cs.ts) as first_session_started_at
    from
        cohort c
        inner join my_data.customer_stream cs
            on c.join_customer = cs.customer
    where
        cs.activity = 'session_started'
    group by
        1,2
)
, first_ever_session_started_features as (
    select
        fe.join_customer,
        fe.join_cohort_id,
        fe.first_session_started_at,
        s.activity,
        s.feature_1,
        s.feature_2,
        s.feature_3,
        s.link
    from
        my_data.customer_stream s
        inner join first_ever_session_started fe
            on s.customer = fe.join_customer
            and s.ts = fe.first_session_started_at
    where 
        s.activity = 'session_started'
)
select
    c.activity_timestamp,
    c.customer,
    c.activity,
    c.activity_occurrence,
    c.feature_1,
    c.feature_2,
    c.feature_3,
    datetime(fe.first_session_started_at, 'America/New_York') as first_session_started_at,
    fe.activity,
    fe.feature_1,
    fe.feature_2,
    fe.feature_3,
    fe.link
from
    cohort c
    left outer join first_ever_session_started_features fe
        on c.join_customer = fe.join_customer
        and c.join_cohort_id = fe.join_cohort_id;
```

The same exact query (with a minor change) applies to *Last Ever.* All you have to do is change the  `min()` function for the  `max()` function. This is the beauty of the AcivitySchema. The queries are incredibly consistent.

So where else can you apply *First Ever* or *Last Ever* besides attribution? What if your customer is a patient and the *First Ever* could be the first visit or the first surgery and you want to attach that information to subsequent visits or when a house was first built and you want that sale information attached to every inspection activity.

