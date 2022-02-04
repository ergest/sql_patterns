
# Introduction
# Minimum Viable SQL Patterns
## Hands-On Design Patterns and Best Practices with SQL

When I first learned SQL in college, it was through the "pyramid" pattern. We studied the basics of relational algebra and set theory for the first 3-4 weeks. I honestly don't remember anything. I only learned SQL properly once I got a job and started using it.

If you pick up a SQL introductory book or course, it follows the same “pyramid” pattern. You start with the language basics, you learn the syntax, then you build up from there to increasingly complex concepts. 

That way of learning rarely sticks

If you've gotten really good at something over the course of your career, and you can solve complex problems with ease, it's because you've built up a collection of patterns and best practices that go beyond the basics.

Experienced analysts and data scientists can solve complex queries quickly because they've built up a collection of patterns and best practices that go beyond the SQL syntax.

These patterns exist in every field.

Chefs don’t create recipes from scratch. They use common cooking patterns, like sautéing vegetables, browning meat, making dough, using spices, etc. to create delicious meals. 

Likewise fiction writers use character patterns like: "antihero", "sidekick", "mad scientist", "girl next door"; plot patterns like romantic comedy, drama, red herring, foreshadowing, cliffhangers, etc.

These basic mental constructs act like LEGO pieces for your mind allowing you to build up and evolve a solution to a complex problem from base level components by mixing and matching.

I believe that studying and learning patterns is the fastest way to level up your skills in any field, especially that of data. But there's a problem. These patterns are rarely codified.

You need to spend years in the field and be exposed to many different data problems to even have a chance to learn them and even then you don't learn them deliberately.

Well, what if you wanted to get really good at SQL really fast? How do you level up your skills in the shortest amount of time possible? Is your only hope to spend a decade in the field?

I don't think so.

I’ve been writing SQL for ~15 years. I’ve seen hundreds of thousands of lines of code. Over time I developed a set of patterns and best practices I always come back to when writing queries. These patterns made my code more efficient, easier to understand and a breeze to maintain.

When looking at other people's code, even though it was correct, I could easily spot how with a just few changes they could improve its the readability and maintainability. I really wanted to help them learn what I knew. 

I looked around for a book or course that taught these patterns but couldn't find one, so I decided to write it.

I've codified and organized all the patterns I know into best practices so you can learn them and start using them right away.

If you already know how to write correct SQL and you want to advance your skills to the next level, this book is for you.

Once you study and learn these patterns you'll be able to:
- Get really good at advanced SQL really fast
- Write efficient, production-ready SQL that's easy to read and maintain
- Learn best practices when querying so you can avoid common traps
- Solve complex queries like an expert without having to wait decades to become one

### How is this book organized?
I'm a huge fan of project-based learning. The idea that you can learn anything if you can come up with an interesting project to use that thing in has proven incredibly useful in my own career. I taught myself data science in just a few months by focusing on a project to build a feature table for leads so I could predict their propensity to convert based on these features.

For this reason, I organized the book around a complex and useful data project that not only will help you understand the patterns but will do so in context. Learning anything in context will help you retain the material much better the next time you need to apply it.

In this book we'll be working with the Stackoverflow dataset that's publicly available in BigQuery for free. You can access it [here](https://console.cloud.google.com/marketplace/product/stack-exchange/stack-overflow).

BigQuery also offers 1TB/month free of processing so even if you sign up for it with a credit card, you can complete this entire course for free. I've made sure that the queries we run are small and limited so you won't have to worry about being charged.

Using this dataset we're going to build a "user reputation" table which calculates reputation metrics per user. This type of table can be very useful if you want to do customer 360 type of analysis or if you want to identify your best customers.

We will get into the details of the project in the next chapter.
