#### The Project
As discussed in the introduction, in this chapter we're going to get into the details of the project that will help you learn the SQL Patterns in context. 

Many books start by teaching you the basic concepts first and by the time you get to use them, you've already forgotten them. By taking a project based approach, we circumvent that problem entirely and you get the learn these patterns simply by following along.

So what is this project?

As you saw in the introduction, we're using a real-world, public dataset from StackOverflow (SO). In case you're not familiar, SO is a popular website where users can ask technical questions about any topic (programming, SQL, databases, data analysis, stats, etc.) and other users can answer these questions.

Based on the quality of the answers, as determined by the community upvotes and downvotes, the users who give them can gain reputation and badges which they can use  as social proof both on the SO site and on other websites.

Using this dataset we're going to build a "user reputation" table which calculates reputation metrics per user. This type of table can be very useful if you want to do customer engagement analysis or if you want to identify your best customers. It also happens to be quite perfect to demonstrate most of the patterns described in this book.

#### Understanding the Data Model
In order to succeed in any SQL endeavor one of the first things we must do is to understand the data model we're working with. This may already exist in the form of documentation but more often than not you'll have to build the model as you go. You might even learn the hard way, like I did, by making mistakes. That's ok.

The SO data model is quite complex but if you search for it online you'll find the version corresponding to their internal database which doesn't match BigQuery. That's because BigQuery modifies the data in certain ways to avoid self joins. I've taken the liberty of drawing it up for you and we'll cover it now.

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

column_name             |data_type| description
------------------------+---------+-----------------------
id                      |INT64    | unique id of the post
title                   |STRING   | post title
body                    |STRING   | post body
accepted_answer_id      |STRING   | the id of the accepted answer for this question
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

