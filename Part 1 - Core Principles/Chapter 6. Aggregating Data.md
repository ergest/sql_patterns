At it's core, aggregation is a form of granularity reduction. It's a one-way path from finely-grained data to coarsely-grained. The most commonly known aggregation functions are `SUM()`, `COUNT()`, `MIN()`, `MAX()` and `AVG()`

These functions perform aggregation on top of various columns but ultimately aggregation performs granularity reduction.

The typical form of aggregation looks like this:
```
select
    user_id,
    count(*) as total_comments
from
    `bigquery-public-data.stackoverflow.comments` c
where 
	creation_date >= '2021-09-01'
	and creation_date < '2021-09-02'
group by
    user_id
```

In this query we're counting the number of comments an individual user has left on various posts on Sept 1. Here's what the results look like:
```
user_id |total_comments|
--------+--------------+
  494134|            14|
 2393191|             3|
  625403|             2|
 1690193|             6|
 1612975|            30|
12299000|             7|
  367401|             1|
 5761558|             2|
 4074081|             1|
  603316|             2|
 3080723|            39|
  328193|            17|
  ```

Notice that we're getting one row per user. This is the magic behind aggregation! It lets us reduce granularity to any level by using the `GROUP BY` clause. If you remember the definition for granularity, (one row per column combination) here we basically get one row per every column in the `GROUP BY`

We're going to use this later when we write our user activity query because we'll need to reduce all the activity levels down to the level of the user. `COUNT(*)` is a special use of the function that counts all the rows

Here are some basic rules about aggregation:

All the columns in the `SELECT` MUST appear in the `GROUP BY` except for the aggregation functions which are not allowed there. You don't have to worry about this too much because all SQL systems will complain and refuse to run the query if you get this rule wrong. Also the names of the columns in the `SELECT` must match the ones in `GROUP BY` and aliases won't work!

Example:
```
select
    c.user_id,
    cast(c.creation_date as date) as creation_date,
    count(*) as total_comments
from
    `bigquery-public-data.stackoverflow.comments` c
where 
	creation_date >= '2021-09-01'
	and creation_date < '2021-09-02'
group by
    user_id,
    cast(c.creation_date as date)
```

In this query, we're grouping by both `user_id` and `creation_date` and you'll notice that we had to `GROUP BY` the actual column name and the full expression for the second column. This looks fine now but sometimes the expressions can get really complicated and you don't want to make your query look like spaghetti code. Fortunately there's an alternative.

We can use numerical values to represent the columns we're grouping by like this:
```
select
    c.user_id,
    cast(c.creation_date as date) as creation_date,
    count(*) as total_comments
from
    `bigquery-public-data.stackoverflow.comments` c
where 
	creation_date >= '2021-09-01'
	and creation_date < '2021-09-02'
group by
    1,2
```

We just keep adding numbers until it matches the total columns. One thing to keep in mind here is that the order of the columns matters. What that means is that if for some reason I had put `COUNT()` in the second column, I'd have to `GROUP BY 1,3` otherwise I'd get an error.
```
select
    c.user_id,
    count(*) as total_comments,
    cast(c.creation_date as date) as creation_date
from
    `bigquery-public-data.stackoverflow.comments` c
where 
	creation_date >= '2021-09-01'
	and creation_date < '2021-09-02'
group by
    1,3
```

That's why I recommend as best practice, put all the aggregate functions last that way your `GROUP BY` will be sequential.

#### Date hierarchies
Dates provide a special case of aggregation because the field contains several hierarchies built in. Given a single timestamp, we can construct multiple granularities from seconds, minutes, hours, days, weeks, months, quarters, years, decades. We do that by using one of the many date manipulation functions, which by the way nobody remembers so everyone always looks them up in the documents.

That's basically what I'm doing in the code above. I'm taking a timestamp field of date + time and stripping away the time to group multiple entries on the same day to a single row. Since timestamps could contain milliseconds, they increase the granularity so we usually try to remove the timestamp or truncate it up to hours or days.

