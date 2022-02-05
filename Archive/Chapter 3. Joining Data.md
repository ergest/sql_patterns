Joining tables is one of the most basic functions in SQL since the databases are designed to minimize redundancy of information and the only to do that is to spread information out into multiple tables. This is called normalization. Joins then allow us to get all the information back in a single piece by combining these tables together.

Joins are usually explained with Venn diagrams of two partially intersecting circles, but in my experience you only understand a join once you get burned by one. So let's talk about how joins can burn you by messing up the query results and giving incorrect information.

#### Multiplicity
If one of the tables being joined has multiple rows with the same value for the column being joined, the final result set will contain at least that many additional rows. So if a 1-many table is joined with a 1-1 table, the final result will contain 1-many rows. If both tables have multiple entries for the same column being joined, the final result set will be a multiple of both.

Let's take a look at a simple example:
```
select
	ph.post_id,
	ph.user_id,
	u.display_name as user_name,
	ph.creation_date as revision_date
from
	`bigquery-public-data.stackoverflow.post_history` ph
	inner join `bigquery-public-data.stackoverflow.users` u on u.id = ph.user_id
where
	true
	and ph.post_id = 4
order by user_id;
```

This is basically how a join works. Assuming two tables have a column in common -- in this case the `user_id` -- we can "lookup" all the user information from post history and attach all the columns of the `users` table into our final result.

Here's the partial result of that query:
```
post_id|user_id |user_name                   |revision_date          |
-------+--------+----------------------------+-----------------------+
      4|       8|Eggs McLaren                |2008-07-31 17:42:52.667|
      4|       8|Eggs McLaren                |2008-07-31 17:42:52.667|
      4|       8|Eggs McLaren                |2008-07-31 17:42:52.667|
      4|    2598|jjnguy                      |2008-10-21 00:39:55.887|
      4|    5640|GEOCHET                     |2009-03-05 17:28:34.823|
      4|    5640|GEOCHET                     |2009-03-05 17:28:34.823|
      4|   18511|Kip                         |2008-10-01 11:48:37.707|
      4|   53114|Gumbo                       |2011-08-31 15:29:52.207|
      4|   56555|Kredns                      |2009-07-25 15:33:10.080|
      4|   56555|Kredns                      |2009-07-25 15:33:10.080|
      4|   63550|Peter Mortensen             |2020-11-11 16:19:20.870|
      4|   63550|Peter Mortensen             |2020-11-11 16:19:20.870|
      4|  126970|Richard210363               |2017-03-10 10:18:33.147|
      4|  126970|Richard210363               |2017-03-10 10:18:33.147|
```

We can see that the `user_id` and `user_name` are repeated several times because the `post_history` table contains multiple rows for the same user id while the `users` table contains one row per user id.

We talked about this in Chapter 1 on granularity. We can validate our claim quickly by running the granularity checking queries for both tables:
```
select 
	user_id,
	count(*) as cnt
from `bigquery-public-data.stackoverflow.post_history` ph
group by 1
having count(*) > 1;
```
```
select 
	id,
	count(*) as cnt
from `bigquery-public-data.stackoverflow.users` ph
group by 1
having count(*) > 1;
```
Here we see multiple rows for the same `user_id` in the `post_history` table and no rows with duplicate `user_id` in the `users` table, so the final result will contain as many entries for the same `user_id` as there are in the `post_history` table.

So if the history table has 10 entries for the same user and the `users` table has 1, the final result will contain 10 x 1 entries for the same user. If for some reason the `users` contained 2 entries for the same user, we'd see 10 x 2 = 20 entries for that user in the final result.

That's what I mean by multiplicity. This is extremely important when doing analysis because a single duplicate row will multiply all your results by a factor of 2 so your numbers will be inflated.

#### Data Reduction
Whenever we do an `INNER JOIN` the final result is always reduced down to just the matching rows.

For example it's very likely that only a subset of users that exist in the `users` table have ever made changes to, commented, or voted on posts on StackOverflow the majority being silent observers. When we do an `INNER JOIN` between `post_history` and `users` we only get the information for the active users.

For the purposes of our project, we only want the active ones so an `INNER JOIN` is very appropriate here. If we wanted everyone, we'd have to user a `LEFT OUTER JOIN` There is one important point on this however.

By doing an `INNER JOIN` you might be inadvertently restricting rows from a result because there might be missing data in the joined table. That's why as a rule of thumb I always advise to start with a `LEFT JOIN`. We'll cover that in Part 2 when we start to talk about patterns.

#### Accidental Inner Join
Did you know that SQL will ignore a `LEFT JOIN` clause and perform an `INNER JOIN` instead if you make this one simple mistake? This is one of those SQL hidden secrets which sometimes gets asked as a trick question in interviews so strap in.

When doing a `LEFT JOIN` you're intending to show all the results on the table in the `FROM` clause but if you need to limit

Let's take a look at the example query from above:
```
select
	ph.post_id,
	ph.user_id,
	u.display_name as user_name,
	ph.creation_date as revision_date
from
	`bigquery-public-data.stackoverflow.post_history` ph
	inner join `bigquery-public-data.stackoverflow.users` u on u.id = ph.user_id
where
	true
	and ph.post_id = 4
order by
	revision_date;
```

This query will produce 58 rows. Now let's change the `INNER JOIN` to a `LEFT JOIN`and rerun the query:
```
select
	ph.post_id,
	ph.user_id,
	u.display_name as user_name,
	ph.creation_date as revision_date
from
	`bigquery-public-data.stackoverflow.post_history` ph
	left join `bigquery-public-data.stackoverflow.users` u on u.id = ph.user_id
where
	true
	and ph.post_id = 4
order by
	revision_date;
```

Now we get 72 rows!! If you scan the results, you'll notice several where both the `user_name` and the `user_id` are `NULL` which means they're unknown. These could be people who made changes to that post and then deleted their accounts. Notice how the `INNER JOIN` was filtering them out? That's what I mean by data reduction which we discussed previously.

Suppose we only want to see users with a reputation of higher than 50. That's seems pretty straightforward just add the condition to the where clause
```
select
	ph.post_id,
	ph.user_id,
	u.display_name as user_name,
	ph.creation_date as revision_date
from
	`bigquery-public-data.stackoverflow.post_history` ph
	left join `bigquery-public-data.stackoverflow.users` u on u.id = ph.user_id
where
	true
	and ph.post_id = 4
	and u.reputation > 50
order by
	revision_date;
```

We only get 56 rows! What happened?

Adding filters on the where clause for tables that are left joined will ALWAYS perform an `INNER JOIN` except for one single condition where the left join is preserved. If we ONLY wanted to see the `NULL` users, we can add the `IS NULL` check to the `where` clause like this:

```
select
	ph.post_id,
	ph.user_id,
	u.display_name as user_name,
	ph.creation_date as revision_date
from
	`bigquery-public-data.stackoverflow.post_history` ph
	left join `bigquery-public-data.stackoverflow.users` u on u.id = ph.user_id
where
	true
	and ph.post_id = 4
	and u.id is null
order by
	revision_date;
```

Now we only get the 12 missing users