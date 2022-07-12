## Introduction
Ever since I read about the [Activity Schema](https://www.activityschema.com) I've been fascinated with it and have wanted to try it out. The only problem is that the only tool that implements it is [Narrator](https://narrator.ai) and you have to pay for it. I also didn't have a good enough dataset to try it on.

Then a friend asked me to help him do some analytics for his Shopify store. I got some of the data stored in BigQuery and Narrator has ready-made activities for it, I decided to give it a try. Unfortunately his Facebook campaigns weren't tagged properly and he only used the free Google Analytics setup on his site so I couldn't do deeper analysis.

In this series of posts, I'll explore what I've learned about the Activity schema and hopefully provide some insight into this new modeling technique. In the first post we'll explore the table and how to set that up. In the upcoming posts we'll cover the various SQL queries that let you explore this table.

## One table to rule them all
Activity schema is based on the idea of a single time-series table that conforms all customer activities to a fixed 11 column schema. You only need 11 columns to express your entire customer journey and to build all the analyses around it.

I will not go into a lot of details about the table and what's stored there, you can read all that in the [github repo.](https://github.com/ActivitySchema/ActivitySchema)

Having done my fair share of modeling in the past I immediately recognized the benefits of the activity schema:

- Each activity is an isolated event that never changes. This makes each activity idempotent (unchanging) and the activity stream table append-only. What that means is that when something changes in the future, I don't have to modify past records to update them like you have to do with dimensional modeling or ER diagrams.
- You don't have to worry about slowly changing dimensions or late arriving facts, you just append them all in the table. We'll cover this later.
- Because the schema is standardized regardless of the activities, querying the model becomes very predictable once you figure out the basics. You're basically joining activities for the same customer in time through the help of temporal relationships.
- There are only 11 temporal relationships which means that almost every question you can think of can be reduced to one or many of these 11 temporal relationships. We'll explore them one by one later as well.

## Constructing the table
Without further ado, let's get into how to build the table. LIke I said earlier, I used Shopify data from a friend's store, so unfortunately I cannot show the results of the queries, but the patterns should be pretty clear. I'm using BigQuery for my experiments.

Creating the table is pretty straightforward:
```sql
create or replace table my_data.customer_stream (
    activity_id string,
    ts timestamp,
    activity string,
    customer string,
    anonymous_customer_id string,
    feature_1 string,
    feature_2 string,
    feature_3 string,
    revenue_impact float64,
    link string,
    activity_occurrence int64,
    activity_repeated_at timestamp
);
```

While that's pretty simple, there are a few things I discovered as I was building the table:

1. Each  `activity - timestamp - customer` row **MUST** be unique. If there are duplicates aggregate queries will be wrong
2. `activity_ocurrence` and `acitivty_repeated_at` must be updated **AFTER** the table has been populated. My query updates the entire table, but you can limit the updates by filtering on the activity you're inserting so you can keep costs low.

Here's the script for updating those columns:
```sql
update my_data.customer_stream a
set activity_occurrence = dt.activity_occurrence,
    activity_repeated_at = dt.activity_repeated_at
from (
    select
        activity_id,
        customer,
        activity,
        ts,
        row_number() over each_activity as activity_occurrence,
        lead(ts,1)   over each_activity as activity_repeated_at
    from 
        my_data.customer_stream
    window 
        each_activity as (partition by customer, activity order by ts asc)
)dt
where 
    dt.activity_id = a.activity_id
    and dt.customer = a.customer
    and dt.activity = a.activity
    and a.ts = dt.ts;
```

## Loading Shopify data
Narrator lists all the the queries for Shopify [here](https://docs.narrator.ai/docs/shopify) I didn't use all the activities so I'll just mention the ones I did use.

### Started Checkout
Customer started a checkout session
```sql
insert into my_data.customer_stream
(
    activity_id,
    ts,
    activity,
    customer,
    anonymous_customer_id,    
    feature_1,
    feature_2,
    feature_3,
    revenue_impact
)
select
    cast(c.id as string)                     as activity_id,
    c.created_at                             as ts,
    'started_checkout'                       as activity,
    coalesce(lower(c.email), lower(o.email)) as customer,
    c.token                                  as anonymous_customer_id,    
    cast(o.total_line_items_price as string) as feature_1,
    c.shipping_address_country_code          as feature_2,
    cast(c.total_tax as string)              as feature_3,
    c.total_price - c.total_discounts        as revenue_impact
from
    shopify.abandoned_checkout as c
    left join shopify.order as o
        on c.token = o.checkout_token
where
    c.created_at is not null
    /* ensure customer + activity + ts is unique in the whole table */
    and not exists (select *
                    from   my_data.customer_stream
                    where  customer = coalesce(lower(c.email), lower(o.email), '')
                           and activity = 'started_checkout'
	                       and ts = c.created_at
                    );
```

A couple of things to notice:
1. We omit some of the the columns here because we don't have values for them. This is ok since you won't always have values for them.
2. The `WHERE` clause is checking for duplicates at the customer, activity, timestamp level like we said above. This is crucial.

### Completed order
Customer completed the checkout process
```sql
insert into my_data.customer_stream
(
    activity_id,
    ts,
    activity,
    customer,
    anonymous_customer_id,    
    feature_1,
    feature_2,
    feature_3,
    revenue_impact
)
select
    cast(o.id as string) as activity_id,
    o.processed_at       as ts,
    'completed_order'    as activity,
    lower(o.email)       as customer,
    null                 as anonymous_customer_id,
    d.code               as feature_1, -- discount code
    o.name               as feature_2, -- order name
    o.processing_method  as feature_3,
   -- this is the merchandize_price with discounts applied
    o.subtotal_price     as revenue_impact
from 
    shopify.order as o
    left join shopify.order_discount_code d
        on d.order_id = o.id
where
    o.cancelled_at is null
    and o.email is not null
    and o.email <> ''
    /* ensure customer + activity + ts is unique in the whole table */
    and not exists (select  *
                    from    my_data.customer_stream
                    where   customer = lower(o.email)
                            and activity = 'completed_order'
                            and ts = o.processed_at
                    );
```

### Shipped order
The order has now been shipped
```sql
insert into my_data.customer_stream
(
    activity_id,
    ts,
    activity,
    customer,
    anonymous_customer_id,    
    feature_1,
    feature_2,
    feature_3,
    link
)
select
    cast(f.id as string) as activity_id,
    f.created_at         as ts,
    'shipped_order'      as activity,
    lower(o.email)       as customer,
    null                 as anonymous_customer_id,
    o.name               as feature_1,
    f.tracking_company   as feature_2,
    l.name               as feature_3,
    null                 as revenue_impact,
    case f.tracking_company 
        when 'FedEx' then 'https://www.fedex.com/apps/fedextrack/?tracknumbers=' || f.tracking_number 
        when 'Canada Post' then 'https://www.canadapost.ca/trackweb/en#/search?searchFor=' || f.tracking_number 
        when 'USPS' then 'https://tools.usps.com/go/TrackConfirmAction?qtc_tLabels1=' || f.tracking_number
        when 'Stamps.com' then 'https://tools.usps.com/go/TrackConfirmAction?qtc_tLabels1=' || f.tracking_number
        when 'DHL eCommerce' then 'https://www.dhl.com/en/express/tracking.html?brand=DHL&AWB=' || f.tracking_number
    end as link,
    null                as activity_occurrence,
    null                as activity_repeated_at
from
    shopify.fulfillment f
    left outer join shopify.location l 
        on f.location_id = l.id
    join shopify.order as o
            on f.order_id = o.id
where
    o.cancelled_at is null
    /* ensure customer + activity + ts is unique in the whole table */
    and not exists (select  *
                    from    my_data.customer_stream
                    where   customer = lower(o.email)
                            and activity = 'shipped_order'
                            and ts = f.created_at
                    );
```

### Order enrichment table
On the rare occasion that you need more dimensionality beyond the 3 features, you can create an optional enrichment table. Ideally this table is also idempotent so you don't have to worry about maintaining history.

```sql
create or replace table my_data.order_enrichment
as
select
    cast(o.id as string) as enriched_activity_id,
    o.created_at         as enriched_ts,
    o.subtotal_price     as subtotal_price,
    o.total_price        as total_price,
    o.total_tax          as tax,
    s.price              as shipping_price, 
    s.title              as shipping_kind,
    o.total_discounts,
    o.total_weight
from
    shopify.order as o
    left join shopify.order_shipping_line s
        on o.id = s.order_id
```

This table can easily be joined to the activity stream via the `enriched_activity_id` which is just the order_id and `enriched_ts`

You can add more activities to the table but we'll stop here for the time being. In Part 2 we'll get into exploring the 11 activities.

### Additional considerations
There are a few things that came up during this exercise that I don't see explained.

The table can easily be created manually, but keeping it updated needs to be automated. Narrator does this natively but if you don't have that tool, you need a way to run the insert scripts. A tool like [Airflow](https://airflow.apache.org/) could be used for this purpose but I haven't tried to do it myself.

Maintaining the mapping between each activity and its features is another thing Narrator handles natively. This is much harder to do manually. You can create a mapping table like the one below, but that doesn't solve the problem of naming columns at query time. That solution would require dynamic SQL.You'd need to know what each feature of each activity means. 
```sql
create or replace table reports.features
(
    activity string,
    feature1 string,
    feature2 string,
    feature3 string
)
as 
select
    'completed_order'   as activity,
    'discount_code'     as feature1,
    'order_name'        as feature2,
    'processing_method' as feature3
```

