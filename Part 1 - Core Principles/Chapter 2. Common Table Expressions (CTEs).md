There are two types of objects you can query in a database, tables and views. A view is a SQL statement that's stored in the database and presented to the user as a read-only table. They can be queried, aggregated and joined with other views or tables. The only difference from tables is you cannot write data to a view.

CTEs or Common Table Expressions are temporary views whose scope is limited to the current query. They are not stored in the database; they only exist while the query is running and are only accessible in that query.

_Side Note: Even though CTEs have been part of the definition of the SQL standard since 1999, it has taken many years for database vendors to implement them. Some versions of older databases (like MySQL before 8.0, PostgreSQL before 8.4, SQL Server before 2005) do not have support for CTEs. All the modern cloud vendors have support for CTEs

We define a single CTE using the `WITH` keyword and then use it in the main query like this:
```
-- Define CTE
WITH <cte_name> AS (
	SELECT col1, col2
	FROM table_name
)

-- Main query
SELECT *
FROM <cte_name>
```

We can define multiple CTEs using `WITH` keyword like this:
```
-- Define CTE 1
WITH <cte1_name> AS (
	SELECT col1
	FROM table1_name
)

-- Define CTE 2
, <cte2_name> AS (
	SELECT col1
	FROM table2_name
)

-- Main query
SELECT *
FROM <cte1_name> AS cte1
JOIN <cte2_name> AS cte2 ON cte1.col1 = cte2.col1
```
Notice that you only use the `WITH` keyword once then you separate them using a comma in front of the name of the each one.

We can refer to a previous CTE in a new CTE thus chaining them together like this:
```
-- Define CTE 1
WITH <cte1_name> AS (
	SELECT col1
	FROM table1_name
)

-- Define CTE 2 by referring to CTE 1
, <cte2_name> AS (
	SELECT col1
	FROM cte1_name
)

-- Main query
SELECT *
FROM <cte2_name>
```

This pattern allows for a lot of flexibility with multi-step calculations. We'll cover that later. 

When CTEs are used it lets us read a query top to bottom and easily understand what's going on. When sub-queries are used, it's a lot harder to trace the logic and figure out which column is defined where and what scope it has.

Just because we can chain CTEs, it doesn't mean we can do that infinitely. There are practical limitations on levels of chaining because after a while the query will end up becoming computationally complex. This depends on the database system you're using. 

So what goes inside a CTE?

Technically any valid SQL statement, but I would advise against making CTEs overly complex. The whole point of using them is to simplify queries not make them unreadable.

Let's see a practical example:

```
with post_history as (
    select
        ph.post_id,
        ph.user_id,
        u.display_name as user_name,
        ph.creation_date as revision_date,
        case 
            when ph.post_history_type_id in (1,2,3) then 'posted'
            when ph.post_history_type_id in (4,5,6) then 'edited'
            when ph.post_history_type_id in (7,8,9) then 'rolledback'
        end as activity_type,
		count(*) as total_revisions
    from
        `bigquery-public-data.stackoverflow.post_history` ph
        join `bigquery-public-data.stackoverflow.users` u on u.id = ph.user_id
    where
        true
        and user_id > 0 --anything < 0 are automated processes
        and post_history_type_id between 1 and 9
        and ph.creation_date >= '2021-09-01'
        and ph.creation_date <= '2021-09-30'
    group by
        1,2,3,4,5
)

select
	post_id,
	user_id,
	user_name,
	revision_date
from
	post_history
where
	activity_type = 'posted'
```

There's a lot happening here so let's unpack it.

First we're defining a CTE called `post_history` where we're selecting from the `post_history` table only the columns we care about. We're joining this data with the `users` table on `user_id` and adding the `display_name` column from that table which we rename/alias as `user_name`

```
post_id |user_id |user_name               |revision_date          |
--------+--------+------------------------+-----------------------+
69018144|  920545|Paul Molodowitch        |2021-09-01 13:18:41.453|
69033214|    7432|Bryan Oakley            |2021-09-02 11:31:43.417|
69018627|  212878|Samuli Hakoniemi        |2021-09-01 14:00:37.923|
69028515| 7158025|mehdigriche             |2021-09-02 06:28:53.633|
69007413|  209103|Frank van Puffelen      |2021-08-31 23:20:03.423|
69031778|  209103|Frank van Puffelen      |2021-09-02 09:58:44.163|
69038140|  209103|Frank van Puffelen      |2021-09-02 19:58:10.450|
69043893| 1333012|sineverba               |2021-09-03 07:03:48.310|
69028961|10325516|Poolka                  |2021-09-02 07:00:34.817|
```

We can now refer to the temporary result we created by the CTE name and filter only the `posted` activity. This is defined in a [[Custom Grouping]] statement where we combine several `post_history_type_ids` into a single group. The definition of each one is described [here](https://meta.stackexchange.com/questions/2677/database-schema-documentation-for-the-public-data-dump-and-sede)

We're also filtering data to just the month of September 2021 in order to make our query fast and limit how much data we scan to only the ones we care about. This is an important pattern discussed later in [[1. Reduce Your Data Before Joining]]

There will be plenty of examples of how to use CTEs in later chapters.