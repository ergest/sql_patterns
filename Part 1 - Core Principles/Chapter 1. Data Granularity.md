Data granularity is the most important concept in SQL. Granularity is a measure of the level of detail in a table or view. Typically this is determined by the primary key (PK) of a table which ensures row uniqueness. This is true in traditional databases where the PK is enforced by the system but in cloud data warehouses that's not true.

The concept of granularity is really important. As we'll see in the next chapter, when you join two tables with different granularity the final number of rows gets multiplied. So if one of the tables contains duplicate rows you will duplicate the final result causing inaccuracies.

Granularity is usually expressed as the number of unique rows for each column or combination of columns. 

For example we'd say "This table has one row per `user_id`" if it's just one column or "This has table has one row per `user_id` per date" which means that there are multiple rows for the same user id in different dates but only one row per user on a given date.

Understanding a table's granularity lets us understand the purpose for which it was built and allows our queries against to be designed accurately from the start. If a table happens to be poorly designed or have messy data we might have to get creative with our queries to manipulate granularity. We'll cover that in Part 2.

For our project we're interested in calculating a number of user level metrics. This means that the final granularity needs to be at the `user_id` level. In order to do this, we need to figure out what actions a user can take. In StackOverflow a user can post an answer or a question, edit an answer or a question, upvote, downvote, comment, etc.

The StackOverflow database has a table called `post_history` which contains a log of all the changes that have been made on a post by a user. Let's familiarize ourselves with it by figuring out the granularity.

First we take a look at the schema.
```
post_history
---------------
id
creation_date
post_id
post_history_type_id
revision_guid
user_id
text
comment
```

The `id` column is likely the primary key here. We can verify that quickly by running:
```
select 
	id,
	count(*) as cnt
from `bigquery-public-data.stackoverflow.post_history` ph
group by 1
having count(*) > 1;
```

We expect to get an empty result set and that's exactly what we get. This definitely the primary key column. So we could express the granularity as "one row per `id`"

This is a good first step but it's not very helpful since the `id` column is either randomly or sequentially generated both of which mean nothing to us. We need to dig further. In this situation, the best thing to do is make an educated guess given the schema and then check your guess by running the same query as above.

We can probably guess for example that the table contains multiple `post_id` and multiple `user_id` entries since a post can be modified by many users and a single user can modify multiple posts. 

The `revision_guid` seems interesting. Does this mean that there could be a single row per revision? That's a decent guess, so let's check it:
```
select 
	revision_guid,
	count(*) as cnt
from `bigquery-public-data.stackoverflow.post_history` ph
group by 1
having count(*) > 1;
```

We get the following result:
```
revision_guid                       |cnt|
------------------------------------+---+
6816da35-39df-4941-80c3-65dfa3754518|  2|
dee77425-2f49-4f18-88eb-5d35dd9fed8d|  3|
473990fa-80aa-4c01-9623-3a900c378a85|  3|
f8399557-802a-4fbd-863a-a0d86097b95b|  3|
4dd1ef11-8063-4800-9a02-183b09dae6b2|  2|
3754d0d4-0591-4796-a998-46f5e069ae79|  3|
43dde670-8d7d-4364-bf87-6d1b8ec7cc15|  3|
61ef4d9e-09cf-49e1-850a-c81cf3b9a413|  3|
2d5d8acc-0bdc-4daf-bcfe-f572042eb159|  3|
9366131a-60f1-4c51-9037-3b863e5ac9ca|  2|
```

This means that table `post_history` has multiple rows for the same `revsion_guid` so that's not it. Let's investigate some raw data and see if we can improve our guess. Grab one of the `revision_guids` and look at all the rows:
```
select *
from `bigquery-public-data.stackoverflow.post_history` ph
where revision_guid = 'f8399557-802a-4fbd-863a-a0d86097b95b';
```
Inspecting the results we notices that the `creation_date` is the same for all 3 rows, as are the `user_id` ,  `post_id`, and `revision_guid`. The `id` is different but we already knew that. The only columns that differ on all three rows are the `post_history_type_id` and the `text`. 

Let's ignore the `text` column. As a rule of thumb, text fields, while unique, are usually only to be used as a last resort since they can be large and joining on them is inefficient.

The `post_history_type_id` however is very interesting. This is a numeric value but it indicates the type of change that was made, so there must be some kind of mapping somewhere that tells us what it means. I was able to find this information [here](https://meta.stackexchange.com/questions/2677/database-schema-documentation-for-the-public-data-dump-and-sede/2678#2678)

So what we can infer from this is that a single revision can contain multiple types of changes which are all saved in the database at the same time. That's why we see multiple rows for the same `revision_guid`. This piece of information is useful because now we can say with confidence that the granularity of the `post_history` table is "one row per revision per change type"

We'll need to get our final data at the `user_id` level of granularity and we'll see how to do that later.