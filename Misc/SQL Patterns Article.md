# SQL Patterns and Best Practices
1. Query composition patterns.  
After you learn the basics, solving harder problems becomes a question of writing longer and more complex queries. Soon your code has sprawled to 300 lines and you can barely make sense of it. Top performing analysts use query composition patterns instead.  
  
Query composition states that you have to break up your query into smaller, more manageable chunks and put those chunks into CTEs (common table expressions).  
  
This makes your code easier to read, understand and verify by you or your colleagues. You can test each CTE individually as you write it and make sure it works as intended.  
  
2. Query maintainability patterns.  
When using CTEs, they should be constructed in such a way that they can be reused if needed later. In software engineering this is known as the DRY principle. (aka Don't Repeat Yourself)  
  
The best part about doing this is that if you find yourself defining the same (or similar) CTE in multiple queries, you can now take that CTE and turn it into a view that can be used across multiple queries.  
  
Unless you're writing an ad-hoc queries, production level code needs to be easier to maintain in the future by yourself or others and easier to debug and fix when problems occur.  
  
3. Query performance patterns.  
Sure you got your 300 line query to work and give the right answer, but does it run in a reasonable amount of time? Production level code needs to be correct but also performant. Why?  
  
Long running queries are very frustrating to write, test and fix. On top of that, they can be incredibly expensive in cloud warehouses where you pay for every minute your code is running.  
  
To make your code performant you need to reduce your proverbial haystack as much as possible before you search for the needle. You can reduce both rows and columns to speed up your code.  
  
4. Query robustness patterns.  
Robustness means that your query will not break if the underlying data changes in unpredictable ways. Real world data is messy, from unexpected nulls, formatting changes, missing data, duplicate rows, etc.  
  
A query that worked yesterday could break today because the underlying data changed. On top of that, real world data will throw unexpected surprises your way. It's best to guard against them before your query goes into production.  
  
If you're ready to take your SQL skills to the next level, my newly released book "Minimum Viable SQL Patterns" covers them in more detail.