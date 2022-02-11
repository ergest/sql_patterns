The query we're working for this project is a complex one. We're taking several tables at varying granularities and transforming them into a single table at the `user_id, date` granularity.

Every complex query can and should be broken down into smaller, simpler elements that can be written and tested independently. In order to achieve this goal we need to first cover the Single Responsibility Principle.

**Single Responsibility Principle (SRP)**
SRP hails from the world of software engineering and states simply that every component in a software system should have a single purpose. This ensures that each component is simple to write, easy to understand and can be tested independently.

When I first started writing queries professionally to answer business questions, I wanted to show off my smarts. I wanted to get the entire query written in one fell swoop, one single, perfect, beautiful query. Reality, however, had other plans.

You see real world data is messy. From inconsistent field types, missing or duplicate rows, unexpected values, etc. I learned pretty quickly that queries, no matter how simple they might seem, needed to be broken down into smaller components and each one tested individually.

Initially I did this with temporary tables where each step built upon the previous step and together they could get me the correct result faster and more accurately. Later I learned how to use CTEs (Common Table Expressions) and I've only used CTEs since then.

#### Brief Introduction to CTEs
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

Applying the SRP to CTEs we state that every CTE needs to have a single responsibility.

#### How to decompose a query
In order to understand how to break down a large, complex query into simpler ones we need to think about what we want to achieve and map out a solution. We're looking to build a table at the `user_id, date` level starting from tables with user activity and date.

We know that a user can perform any of the following activities on any given date:
1. Post a question
2. Post an answer
3. Edit a question
4. Edit an answer
5. Comment on a post
6. Receive a comment on their post
7. Receive a vote (upvote or downvote) on their post

Solving a complex problem is a matter of breaking it down into simpler problems. Let's illustrate this with our user engagement project.

Sub-problem 1
In order to get the first 4 activities at the `user_id, date granularity` we first need to solve the problem of reducing the granularity of the `post_history` to the `user_id, date, post_id` level.

Then we'll join that back to the posts (by combining questions and answers) so we can get the post types. Finally we will reduce the granularity to just the `user_id, date` by aggregating each activity on each post type.

Sub-problem 2
We will apply the same granularity reduction logic to comments and votes so that in the end we have 3-4 CTEs all at the same granularity of `user_id, date`. 

Sub-problem 3
Once we get all activity types on the same granularity, it will be very easy to calculate all the metrics per user per date.

In the next chapter we'll begin designing all the CTEs we need for the final query

#### Principles of Unix Programming

#### Recap
