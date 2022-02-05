#### Understanding the Data Model
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

This table also connects to the `users` table. A single user can perform multiple activities on a post. This is known as a bridge table between the users and posts which have a many-to-many relationship which cannot be modeled otherwise.
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

It has all the user attributes, like name, age, date of creation, reputation, etc. We'll use some of these attributes in our final table.

The same thing happens with the `comments` table. It has a zero-to-many relationship with posts and with users, which means that both a user or a post could have 0 comments. The connection to the posts indicates comments on a post and the connection to the user indicates comments by a user.

