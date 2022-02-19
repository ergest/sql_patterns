## Chapter 1: Introducing The Project
As discussed in the introduction, in this chapter we're going to get into the details of the project that will help you learn the SQL Patterns in context. 

Many books start by teaching you the basic concepts first and by the time you get to use them, you've already forgotten them. By taking a project based approach, we circumvent that problem entirely and you get the learn these patterns simply by following along.

So what is this project?

As you saw in the introduction, we're using a real-world, public dataset from StackOverflow (SO). In case you're not familiar, SO is a popular website where users can ask technical questions about any topic (programming, SQL, databases, data analysis, stats, etc.) and other users can answer these questions.

Based on the quality of the answers, as determined by the community upvotes and downvotes, the users who give them can gain reputation and badges which they can use  as social proof both on the SO site and on other websites.

Using this dataset we're going to build a "user reputation" table which calculates reputation metrics per user. This type of table can be very useful if you want to do customer engagement analysis or if you want to identify your best customers. It also happens to be quite perfect to demonstrate most of the patterns described in this book.

The schema of what it would look something like this:
```
user_id
user_name
posts
answers
questions
streak_in_days
posts_per_day
answers_per_day
questions_per_day
upvotes_per_day
downvotes_per_day
comments_on_user_posts_per_day
comments_by_user_per_day
answers_per_post_ratio
upvotes_per_post
downvotes_per_post
comments_per_post_on_user_posts
comments_by_user_per_per_post
```

Why is this useful?

In many marketing campaigns it is very useful to segment your customers based on certain behavior and engagement criteria and a table like this is perfect. You're basically aggregating various metrics assuming you can associate them with a user.

Because we have one row per user, it means we have to transform all user related data at the `user_id, date`  granularity. We'll talk about how to do that in the next few chapters.

### Understanding the Data Model
In order to succeed in any SQL endeavor one of the first things we must do is to understand the data model we're working with. This may already exist in the form of documentation but more often than not you'll have to build the model as you go. You might even learn the hard way, like I did, by making mistakes. That's ok.

The SO data model is quite complex but if you search for it online you'll find the version corresponding to their internal database which doesn't match BigQuery. That's because BigQuery modifies the data in certain ways to avoid self joins. I've taken the liberty of drawing it up for you and we'll cover it now.

Here's a look at the Entity-RElationship (ER) diagram
![[StackOverflow BQ ER Diagram.png]]

There are 8 tables that represent the various post types. You can get this result by using the `INFORMATION_SCHEMA` views in BigQuery like this:
```
SELECT table_name
FROM `bigquery-public-data.stackoverflow.INFORMATION_SCHEMA.TABLES`
WHERE table_name like 'posts_%'

table_name                |
--------------------------+
posts_answers             |
posts_orphaned_tag_wiki   |
posts_tag_wiki            |
posts_questions           |
posts_tag_wiki_excerpt    |
posts_wiki_placeholder    |
posts_privilege_wiki      |
posts_moderator_nomination|
```

We'll be focusing on just two of them for our project:
1. `posts_questions` contains all the question posts
2. `posts_answers` contains all the answer posts

They both have the same schema:
```
SELECT column_name, data_type
FROM `bigquery-public-data.stackoverflow.INFORMATION_SCHEMA.COLUMNS`
WHERE table_name = 'posts_answers'

column_name             |data_type|
------------------------+---------+
id                      |INT64    |
title                   |STRING   |
body                    |STRING   |
accepted_answer_id      |STRING   |
answer_count            |STRING   |
comment_count           |INT64    |
community_owned_date    |TIMESTAMP|
creation_date           |TIMESTAMP|
favorite_count          |STRING   |
last_activity_date      |TIMESTAMP|
last_edit_date          |TIMESTAMP|
last_editor_display_name|STRING   |
last_editor_user_id     |INT64    |
owner_display_name      |STRING   |
owner_user_id           |INT64    |
parent_id               |INT64    |
post_type_id            |INT64    |
score                   |INT64    |
tags                    |STRING   |
view_count              |STRING   |
```

Both tables have an `id` column that identifies a single post, `creation_date` that identifies the timestamp when the post was created and a few other attributes like `score` for the upvotes and downvotes. 

Note the `parent_id` column which signifies a hierarchical structure. The `parent_id` is a one-to-many relationship that links up an answer to the corresponding question. A single question can have multiple answers but an answer belongs to one and only one question.

As you can see there's no `user_id` in the table because posts and users have a many-to-many relationship. They're connected via the `post_history` table.
```
SELECT column_name, data_type
FROM `bigquery-public-data.stackoverflow.INFORMATION_SCHEMA.COLUMNS`
WHERE table_name = 'post_history'

column_name         |data_type|
--------------------+---------+
id                  |INT64    |
creation_date       |TIMESTAMP|
post_id             |INT64    |
post_history_type_id|INT64    |
revision_guid       |STRING   |
user_id             |INT64    |
text                |STRING   |
comment             |STRING   |
```

Both post types (question and answer) have a one-to-many relationship to the `post_history`. A single post can have many types of activities identified by the `post_history_type_id` column. 

This id indicates the different types of activities a user can do on the site. We're only concerned with the first 6. You can see the rest of them [here](https://meta.stackexchange.com/questions/2677/database-schema-documentation-for-the-public-data-dump-and-sede/2678#2678) if you're curious.

1 = Initial Title - initial title _(questions only)_  
2 = Initial Body - initial post raw body text  
3 = Initial Tags - initial list of tags _(questions only)_  
4 = Edit Title - modified title _(questions only)_  
5 = Edit Body - modified post body (raw markdown)  
6 = Edit Tags - modified list of tags _(questions only)

The first 3 indicate when a post is first submitted and the next 3 when a post is edited.

This table also connects to the `users` table. A single user can perform multiple activities on a post. This is known as a bridge table between the users and posts which have a many-to-many relationship which cannot be modeled otherwise.

The `users` table has one row per user and contains user attributes such as name, reputation, etc. We'll use some of these attributes in our final table.
```
SELECT column_name, data_type
FROM `bigquery-public-data.stackoverflow.INFORMATION_SCHEMA.COLUMNS`
WHERE table_name = 'users'

column_name      |data_type|
-----------------+---------+
id               |INT64    |
display_name     |STRING   |
about_me         |STRING   |
age              |STRING   |
creation_date    |TIMESTAMP|
last_access_date |TIMESTAMP|
location         |STRING   |
reputation       |INT64    |
up_votes         |INT64    |
down_votes       |INT64    |
views            |INT64    |
profile_image_url|STRING   |
website_url      |STRING   |
```

Next we take a look at the `comments` table. It has a zero-to-many relationship with posts and with users, which means that both a user or a post could have 0 comments. The connection to the posts indicates comments on a post and the connection to the user indicates comments by a user.

```
SELECT column_name, data_type
FROM `bigquery-public-data.stackoverflow.INFORMATION_SCHEMA.COLUMNS`
WHERE table_name = 'comments'

column_name      |data_type|
-----------------+---------+
id               |INT64    |
text             |STRING   |
creation_date    |TIMESTAMP|
post_id          |INT64    |
user_id          |INT64    |
user_display_name|STRING   |
score            |INT64    |
```

Finally the `votes` table represents the upvotes and downvotes on a post. Once we connect a post to a user, we can compute This is exactly what we need to compute the total vote count on a user's post which will indicate how good the question or the answer is. This table has a granularity of one row per vote per post per date.

```
SELECT column_name, data_type
FROM `bigquery-public-data.stackoverflow.INFORMATION_SCHEMA.COLUMNS`
WHERE table_name = 'votes'

column_name  |data_type|
-------------+---------+
id           |INT64    |
creation_date|TIMESTAMP|
post_id      |INT64    |
vote_type_id |INT64    |
```

Note that the `votes` table is connected to a post, so in order for us to get upvotes and downvotes on a user's post, we'll need to join it with the `users` table.