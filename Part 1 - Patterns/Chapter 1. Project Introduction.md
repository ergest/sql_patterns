#### The Project
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

I will explain all the concepts as we encounter them so that you'll be able to learn them as you do the work.