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

We talked about this in Chapter 1 on granularity. We can validate our claim quickly by running the granularity checking query:


So if the history table has 10 entries for the same user and the `users` table has 1, the final result will contain 10 x 1 entries for the same user. If for some reason the `users` contained 2 entries for the same user, we'd see 10 x 2 = 20 entries for that users in the final result.

That's what I mean by multiplicity. This is extremely important when doing analysis because a single duplicate row will multiply all your results by a factor of 2!

#### Data Reduction
Whenever we do an `inner join` the final result is always reduced down to just the matching rows. This is fine if both tables have a foreign key relationship enforced by the database which ensures no orphaned rows. However in modern data warehouses this relationship is not enforced.

What this means is that by doing an `inner join` you might be inadvertently restricting rows from a table because there's no data for them in the joined table. This gives rise to a pattern I call [[Start with a Left Join]] 

When doing a left join always put the table you care about the most on the from clause and the left joined table after. But don't take this to the extreme and do a `full outer join` just yet

#### Accidental Inner Join
Whenever you're doing a `left join` always keep in mind the dirty little secret that will ignore your `left join` go ahead and perform an `inner join` instead and leave you none the wiser.

#### The Dangerous CROSS JOIN

#### The FULL OUTER JOIN
