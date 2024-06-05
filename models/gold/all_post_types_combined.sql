{{
    dbt_utils.union_relations(relations=[ref('posts_answers_clean'), ref('posts_questions_clean')])
}}
