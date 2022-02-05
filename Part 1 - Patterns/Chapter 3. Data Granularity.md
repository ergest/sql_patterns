Granularity is a measure of the level of detail that determines an individual row in a table or view. The reason it's the most important concept is because when you join two tables with different granularities the final number of rows gets multiplied. So if one of the tables contains duplicate rows you will duplicate the final result causing inaccuracies.

Granularity is usually expressed as the number of unique rows for each column or combination of columns. 

For example we'd say "This table has one row per `user_id`" if it's just one column or "This has table has one row per `user_id` per date" which means that there are multiple rows for the same user id in different dates but only one row per user on a given date.

Understanding a table's granularity lets us understand the purpose for which it was built and allows our queries against to be designed accurately from the start. If a table happens to be poorly designed or have messy data we might have to get creative with our queries to manipulate granularity.

For example the `post_history` table contains a log of all the changes that a user can perform on a post on a given date. Therefore the granularity is one row per user, per post, per date.

The `comments` table contains a log of all the comments on a post by a user on a given date so its granularity is also one row per user, per post, per date.

The `votes` table contains a log of all the upvotes and downvotes on a post on a given date. It has separate rows for upvotes and downvotes so its granularity is one row per post, per vote type, per date.

To find a table's granularity you either read the documentation, or if you're suspicious like me, you make an educated guess and check. Trust but verify. Real world data is messy

How do you check? It's easy.

For the `post_history` table we can run the following query:
```
SELECT 
	creation_date,
	post_id,
	post_history_type_id,
	user_id,
	COUNT(*) AS total_rows
FROM `bigquery-public-data.stackoverflow.post_history`
GROUP BY 1,2,3,4
HAVING COUNT(*) > 1;
```
So I'm aggregating by all the columns I expect to make up the unique row and filtering for any that invalidate my assumption. If my hunch is correct, I should get 0 rows from this query.

But we don't! We get a bunch of duplicate rows:
```
creation_date          |post_id |post_history_type_id|user_id |total_rows|
-----------------------+--------+--------------------+--------+----------+
2020-07-20 05:00:26.413|62964197|                  34|      -1|         2|
2020-08-05 16:31:15.220|63272171|                   5|14038907|         2|
2018-10-08 09:54:40.990|40921767|                   5| 4826457|         2|
2020-05-07 22:02:27.877|61637980|                  34|      -1|         2|
2018-10-13 05:26:22.243|52784015|                   5| 6599590|         2|
2021-01-03 10:35:35.693|65550662|                   5|12833166|         2|
2018-12-02 14:28:12.947|53576317|                   5|10732059|         2|
2018-09-05 04:16:26.440|52140985|                   4| 3623424|         3|
2018-12-17 22:43:27.800|53826052|                   8| 1863229|         2|
2018-09-13 17:13:31.490|52321596|                   5| 5455640|         2|
```

This means we have to be careful when joining with this table on `post_id, user_id, creation_date, post_history_type_id` and we'd have to deal with the duplicate issue first.