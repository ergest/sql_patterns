# Introduction
This is a book about SQL Patterns. Patterns describe problems that occur over and over in our professional settings. A pattern is like a template that you can apply to different problems. Once you learn each one, you can apply them to solve problems faster and make your code better.

We can illustrate this with an example. In fiction writing, authors rarely write from scratch. They use character patterns like: “antihero”, “sidekick”, “mad scientist”, “girl next door.” They also use plot devices like "romantic comedy," "melodrama", "red herring", "foreshadowing", "cliffhangers", etc. This helps them write better books, movies and TV shows faster.

Learning and applying patterns is how you level up in your career.

Each pattern consists of four elements:

1. The **pattern name** is a handle that describes the problem and/or potential solutions
2. The **problem** describes when you should apply the pattern and in what context
3. The **solution** describes the elements of the design for the solution to the problem
4. The **tradeoffs** are the consequences of applying that specific solution

## Who am I
I’ve been writing SQL for 15+ years. I’ve seen and written hundreds of thousands of lines of code. Over time I noticed a set of patterns and best practices I always come back to when writing queries. These patterns made my code more efficient, easier to understand and a breeze to maintain.

## Why did I write this book
I have a background in computer science. As part of the curriculum we learn how to make our code more efficient, more readable and easy to debug. As I started to write SQL, I applied many of these lessons to my own code.

When reviewing other people’s code I would often spot the same mistakes. There were chunks of code that would repeat everywhere. The queries were long, complex and slow. I would often have rewrite them just so I could understand what they were doing.

Software engineers have long used design patterns to make their code easier to write, understand and maintain. I looked around for a book or course that taught these same patterns for SQL. There are a lot of SQL books that show you how to query data, how to transform and model it but couldn’t find one that explained how to organize code, so I decided to write it myself.

## Who this book is for
This book is for anyone who is familiar with SQL and wants to take their skills to the next level. We won't cover any of the basic syntax here so make sure you have that down pat. I expect you to already know how to join tables and do basic filtering and aggregation.

If you're using SQL to build complex data processing workflows -- like I have -- this book is a must for you.

If you find that your SQL code is often inefficient and slow and you want to make it faster, this book is for you.

If you find that your SQL code is long, messy and hard to understand and you want to make it cleaner, this book is for you

If you find that your SQL code breaks easily when data changes and you want to make it more resilient, this book is for you.

## What you'll learn in this book
I'm a huge fan of project-based learning. You can learn anything if you can come up with an interesting project to use it thing in. I used a project when I taught myself data science.

That's why for this book I wanted to come up with an interesting and useful data project to organize it around. I explain each pattern as I walk you through the project.

This will ensure that you learn the material better and remember it the next time you need to apply it.

In the previous edition of this book I used the StackOverflow dataset that's publicly available in BigQuery. Realizing that not everyone has access to this and that it could dissappear at any moment I decided to make a few changes

First of all I made the tables available as parquet files in GitHub. Second I decided to use the freely available (and may I say quite amazing) DuckDB. The instructions for setting everything up are available on this repo: https://github.com/ergest/sqlpatterns

I've also included all the code in the repo so you can copy/paste it and run it. I do however strongly encourage you to actually type it yourself. You'll learn better that way.

Using this dataset we're going to build a table which calculates reputation metrics. You can use this same type of table to calculate a customer engagement score or a customer 360 table.

As we go through the project, we'll cover each pattern when it arises. That will help you understand why we're using that pattern at that exact moment. Each chapter will cover a select group of patterns while building on the previous chapters.

## How this book is organized (TBD)
In **Chapter 1** we introduce the StackOverflow database we'll be working with throughout the book. We'll make sure you set up your development environment correctly and can run the queries.

In **Chapter 2** we cover *Core Concepts and Patterns*. These are data transformation patterns that act as our basic building blocks throughout the book. I explain each one using the StackOverflow dataset since we'll be using every one in our final query. The remaining patterns are grouped into four categories and each has its own chapter.

In **Chapter 3** we cover *Modularity Patterns*. We start off by learning how to decompose large queries into smaller, more modular and reusable pieces to make it easy to solve just about any complex problem. We cover how modularizing queries helps make your code easy to read, understand, maintain and extend.

In **Chapter 4** we cover *Advanced Modularity* where we take what we learned in Chapter 3 and apply it to *dbt* (tm). These are patterns I use everyday in my job and have helped me to make my code not only easier to maintain and debug but also portable across many platforms.

In **Chapter 5** we cover *Performance* patterns. They teach you ways to make your code faster without sacrificing functionality or clarity. It’s a delicate balance because performant code can sometimes look really messy. We don't cover any one platform specifically but rather patterns that work across multiple platforms.

In **Chapter 6** we cover *Robustness* patterns. They teach you ways to make your code resistant to messy data, such as duplicate rows, missing values, unexpected NULLs, etc.

The project is interwoven throughout the book. I make sure that each chapter covers some section of the final query.

In **Chapter 7** we wrap up our project and you get to see the entire query. By now you should be able to understand it and know exactly how it was designed. I recap the entire project so that you get another chance to review all the patterns. The goal here is to allow you to see all the patterns together and give you ideas on how to apply them in your day-to-day work.

With that out of the way, let's dive into the project.