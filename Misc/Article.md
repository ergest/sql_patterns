# An Introduction to SQL Design Patterns and Best Practices

When I first learned SQL in college, it was truly from the ground up. The database course in the computer science curriculum had us studying relational algebra and set theory. We wrote all our answers to queries in a weird math notation and didn't touch a database until mid-semester. I only learned SQL properly once I got a job and finally started using it. 

If you pick up a SQL introductory book or course, it follows the same “pyramid” pattern. You start with the language basics, you learn the syntax, then you build up from there to increasingly complex concepts.

That way of learning rarely sticks.

If you think about anything you remember really well, you most likely learned it by mapping problems to solutions. More importantly, by mapping many problems to solutions, you start to learn patterns that allow you to recognize and solve certain types of problems instantly.

Experienced analysts and data scientists are able to solve complex queries quickly because they've built up a collection of patterns and best practices that go beyond the SQL syntax. They use these patterns to break down these complex queries into simple elements and solve them quickly.

Actually patterns exist in every field. 

Chefs don’t create recipes from scratch. They use common cooking patterns, like sautéing vegetables, browning meat, making dough, using spices, etc. to create delicious meals. 

Likewise fiction writers use character and plot patterns like romantic comedy, drama, red herring, foreshadowing, cliffhangers, etc.

In programming they’re called design patterns. 

### What are these design patterns?
They're basically mental constructs that act like LEGO pieces for your mind. Like LEGO, they enable you to find solutions to complex problems by mixing and matching.

Whether you are aware of it or not, if you have a lot of experience in a field, you're using patterns to quickly find solutions to novel problems in your field in just minutes.

Studying and learning patterns is the fastest way to level up in any field. The problem is that you need to spend years in that field to learn them and even when you do, you end up learning them haphazardly.

Also nobody teaches this way. You'd need an expert in the field to codify them in a way that are easy to learn and easy to teach.

I’ve been writing SQL for ~15 years. I’ve seen hundreds of thousands of lines of code. Over time I developed a set of patterns and best practices I always come back to when writing queries. I've codified and organized them into best practices so you can learn them and start using them right away.

If you're starting out as a data analyst, scientist or engineer and you study these patterns you'll be able to:
-   Level up your SQL skills in record time without taking yet another boring course
-   Write high-quality, production-ready SQL that's easy to understand and maintain
-   Solve complex queries like an expert without having to wait decades to become on

The following are only a subset of what I've decoded so far. 

So without further ado let's get into it.

### Top 10 SQL Design Patterns and Best Practices

**Pattern 1: Always use CTEs** 
When writing a complex query it’s a good idea to break it down into smaller components. As tempting as it might be to solve the query in one step don’t. CTEs make your query easier to write and maintain in the future.

CTEs or Common Table Expressions are SQL queries you define inside a query and use as a temporary result. They help by breaking down large complex queries into easier, more manageable ones. 

You define a single CTE using the `WITH` keyword like this:
```
WITH <cte_name> AS (
	SELECT col1, col2
	FROM table_name
)
SELECT *
FROM <cte_name>
```
You can define multiple CTEs again using `WITH` keyword like this:
```
WITH <cte1_name> AS (
	SELECT col1
	FROM table1_name
)
, <cte2_name> AS (
	SELECT col1
	FROM table2_name
)
SELECT *
FROM <cte1_name> AS cte1
JOIN <cte2_name> AS cte2 ON cte1.col1 = cte2.col1
```
This should suffice to whet your appetite. I can't get into more details here because that would require a longer article.

**Pattern 2: Keep CTEs small and single purpose** 
Your CTEs needs to be an encapsulated logical components that help you build your final query quickly and easily. They shouldn't try to do too much. You can then mix and match the CTEs to solve just about any data request. This also makes the CTEs easy to test as you build them.

You can do just about anything you can do in SQL inside a CTE:
1. Pre-Filter data to the desired subset before joining later, which speeds up queries
2. Pre-Aggregate data in order to create custom groupings used later
3. Pre-Calculate a metric that's used later in another calculation
4. etc.

**Pattern 3: Start with the ground truth**
The ground truth means to start with definitions. The definitions will lead you to the tables you will then need to build your final query. 

Let's say you're being asked to figure out how many users visited a certain page on the website. Unless you're very familiar with your data or have done this analysis before, your first questions should be:
1. What's the definition of a user? Is it a web session or only those who have signed in to the website?
2. What's the definition of a visit? Is it when they viewed the page? If so, what's the minimum amount of time spent on the page in order for it to count as a visit?
3. How do we know which page they visited? Is it only available in the URL? If so is there a pattern in the URL that defines it or is it available elsewhere in the system?

Each of these definitions will tell you where to go and find the data. By building your queries on top of ground truth, you ensure that final result will likely be correct and true. 

**Pattern 4: Combine CTEs to solve any query**
As we talked about earlier you can combine multiple CTEs to build up a solution to a complex query. 

There are a couple of ways you can do that:
1. By chaining them
2. By nesting them

We saw an example of chaining earlier. This is where you define queries from separate tables in each CTE and then you combine them later.
```
WITH <cte1_name> AS (
	SELECT col1
	FROM table1_name
)
, <cte2_name> AS (
	SELECT col1
	FROM table2_name
)
SELECT *
FROM <cte1_name> AS cte1
JOIN <cte2_name> AS cte2 ON cte1.col1 = cte2.col1
```
This pattern is great for breaking up large queries into simpler elements

You can also define a CTE based on a previous CTE thereby nesting them. Just keep in mind many database systems have limits on how deep this nesting can be.
```
WITH <cte1_name> AS (
	SELECT col1
	FROM table1_name
)
, <cte2_name> AS (
	SELECT col1
	FROM <cte1_name>
)
SELECT *
FROM table2_name
JOIN <cte2_name> AS cte2 ON cte1.col1 = cte2.col1
```
This pattern is great for multi-step calculations.

**Pattern 5: Don't Repeat Yourself (DRY)**
If you find yourself joining the same table multiple times or doing the same calculation, aggregation or filtering, that query chunk should be placed in a CTE. Not only does this refactoring make the code easier to read, but it can also identify chunks of code that could be used across multiple queries which can be made into views.

**Pattern 6: Don't mix layers of abstraction**
Modern data warehouses have to deal with billions of rows of data and return results in seconds. One of the many ways this is achieved is by building base tables and views that de-normalize transactional data. Reporting is then built on top of these de-normalized tables.

Often there are two or more layers of intermediate tables added before a reporting table is generated because they're combining data from multiple applications. This creates multiple levels of abstraction.

When an analyst or data scientist wants to add a missing column to a report, a quick solution would be to join the reporting table (that is 3 or 4 levels of abstraction downstream of source data) directly to a source table thus mixing layers of abstraction. This is one of the biggest sources of tech debt in data warehouses today.

It's better (but more painful) to add the needed column to all the intermediate layers before exposing it to the reporting layer.

**Pattern 7: Reduce your data before joining**
When working with large tables, one of the easiest ways to speed up query performance is to reduce your data in a CTE by pre-filtering or pre-aggregating before joining it later.

For example if you only need one month of data from a large table, create a CTE that pre-filters the data down before joining it later. There might even be a partition or index set up on that data column making your query really fast.

**Pattern 8: Only work with the smallest subset of columns you need**
It’s very tempting to do `SELECT *` in all your queries or CTEs, especially if you don’t know which columns you need later. 

Cloud data warehouse use columnar storage which means that you can make your query a lot faster by selecting only the subset of columns you need. Some of them even charge you based on how much data you're scanning so when you only choose the columns you need, you're also saving money in the long run.

**Pattern 9: Expect the unexpected**
From NULLs, to missing data, duplicate rows and random values, real world data is messy. A well-written query is robust enough to handle many of these cases without crashing or giving inaccurate results.

This means that you have to have a sensible replacement value for nulls/unknowns. If you know that your query will produce nulls, for example a `CASE` statement, a left join or a type conversion from a String to a Number, you should always use `IFNULL()` or `COALESCE()` to provide a sensible replacement value.

**Pattern 10: Start with a left join** 
You never know if the column you’re joining on is fully represented in both tables. An inner join will filter out the non-matching rows and they could be important. By starting with a left join, you ensure that your query remains robust to future data changes.

If you liked these and want to learn more, I'm working on a book where I explain each one in more detail with specific examples for each, and we get into all the ones I didn't have room for in this article. We also cover a few case studies where I break down large complex queries so you can see exactly how the patterns are applied in the real world.

To stay up to date, follow me on [Twitter](https://twitter.com/ergestx)