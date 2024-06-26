/*
Fully client/web side SQL validation for the database course at Stockholm University
Copyright (C) 2024 Edwin Sundberg

This program is free software: you can redistribute it and/or modify
it under the terms of the GNU General Public License as published by
the Free Software Foundation, either version 3 of the License, or
(at your option) any later version.

This program is distributed in the hope that it will be useful,
but WITHOUT ANY WARRANTY; without even the implied warranty of
MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
GNU General Public License for more details.

You should have received a copy of the GNU General Public License
along with this program.  If not, see <https://www.gnu.org/licenses/>.
*/
import { useCallback, useEffect, useState } from 'react';
import './App.css';
import logo from './db_scheme.png';
import ResultTable from './ResultTable';
import Editor from 'react-simple-code-editor';

import QuestionSelector, { Question } from './QuestionSelector';

// @ts-ignore
import { highlight, languages } from 'prismjs/components/prism-core';
import initSqlJs from "sql.js";
import 'prismjs/components/prism-clike';
import 'prismjs/components/prism-sql';
import 'prismjs/themes/prism.css';
import ViewsTable from './ViewsTable';
import { format } from 'sql-formatter';
import React from 'react';

import questions from './questions.json'
import { isCorrectResult } from './utils';


// Representing a view
interface View {
  name: string;
  query: string;
}

function App() {
  const [question, setQuestion] = useState<Question>(questions[0].questions[0]);
  const [database, setDatabase] = useState<initSqlJs.Database>();
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState<string>(localStorage.getItem('questionId-' + question.id) || "SELECT * FROM student;");
  const [result, setResult] = useState<{ columns: string[], data: (number | string | Uint8Array | null)[][] } | null>(null);
  const [views, setViews] = useState<View[]>([]);
  
  const initDb = useCallback(async () => {
    setResult(null);
    const sqlPromise = initSqlJs(
      {
        locateFile: (file) => `https://sql.js.org/dist/${file}`,
      }
    );
    const dataPromise = fetch('/data.sqlite').then((res) => res.arrayBuffer());
    const [SQL, data] = await Promise.all([sqlPromise, dataPromise]);
    const db = new SQL.Database(new Uint8Array(data));
    setDatabase(db);
  }, []);

  useEffect(() => {
    initDb();
  }, [initDb]);

  useEffect(() => {
    if (!database) {
      return;
    }
    const res = database.exec('SELECT * FROM student');
    console.log(res);
  }, [database]);

  useEffect(() => {
    if (!database) {
      return;
    }
    localStorage.setItem('questionId-' + question.id, query);
    // ensure that questionid is in localstorage writtenQuestions
    const writtenQuestions = localStorage.getItem('writtenQuestions');
    if (!writtenQuestions) {
      localStorage.setItem('writtenQuestions', JSON.stringify([question.id]));
    } else {
      const parsed = JSON.parse(writtenQuestions);
      if (!parsed.includes(question.id)) {
        parsed.push(question.id);
        localStorage.setItem('writtenQuestions', JSON.stringify(parsed));
      }
    }
    try {
      database.prepare(query);
      setError(null);
    } catch (e) {
      // @ts-ignore
      setError(e.message);
    }
  }, [database, query, question.id]);


  const refreshViews = useCallback((upsert: boolean) => {
    if (!database) {
      return;
    }

    const res = database.exec('SELECT name, sql FROM sqlite_master WHERE type="view"');
    let fetchedViews: View[] = [];
    if (res.length !== 0) {
      const fetched = res[0].values as string[][];
      fetchedViews = fetched.map(([name, query]) => ({ name, query }));
    }

    if (upsert) {
      localStorage.setItem('views', JSON.stringify(fetchedViews));
    }

    setViews(fetchedViews);

    // Recreate missing views
    const storedViews = localStorage.getItem('views');
    if (storedViews) {
      const savedViews: View[] = JSON.parse(storedViews);
      const missingViews = savedViews.filter(
        savedView => !fetchedViews.some(fetchedView => fetchedView.name === savedView.name)
      );
      missingViews.forEach(view => {
        database.exec(view.query);
      });
      if (missingViews.length > 0) {
        refreshViews(false); // Refresh views again to update the state after recreating missing views
      }
    }
  }, [database]);

  const runQuery = useCallback(() => {
    if (!database) {
      return;
    }
    try {
      const res = database.exec(query);
      if (res.length !== 0) {
        const { columns, values } = res[0];
        setResult({ columns, data: values });
      } else {
        setResult({columns: [], data: []});
      }
      refreshViews(true);
    } catch (e) {
      // @ts-ignore
      setError(e.message);
    }
  }, [database, query, refreshViews]);

  const deleteView = useCallback((name: string) => {
    if (!database) {
      return;
    }
    database.exec(`DROP VIEW ${name}`);
    refreshViews(true);
  }, [database, refreshViews]);

  useEffect(() => {
    refreshViews(false);
  }, [database, refreshViews]);

  // Save query based on question
  const loadQuery = useCallback((oldQuestion: Question, newQuestion: Question) => {
    setQuery(localStorage.getItem('questionId-' + newQuestion.id) || "SELECT * FROM student;");
  }, [setQuery]);

  return (
    <div className="App">
      <header className="App-header">
        <h1 className='text-6xl font-semibold my-3'>SQL TUTOR</h1>
        <img src={logo} className="DB-Layout" alt="logo" />
        <QuestionSelector onSelect={(selectedQuestion) => {loadQuery(question, selectedQuestion); setResult(null); setQuestion(selectedQuestion)}}></QuestionSelector>
        <p className='break-words max-w-4xl mb-4 font-semibold text-left text-xl p-2'>{question.description}</p>
        <Editor
          value={query}
          onValueChange={code => setQuery(code)}
          highlight={code => highlight(code, languages.sql)}
          padding={10}
          className="font-mono text-3xl w-screen max-w-4xl bg-slate-800 border-2 min-h-40"
        />
        
        {error && <p className='font-mono text-red-500 max-w-4xl break-all'>{error}</p>}
        <div className='flex text-white font-semibold text-base '>
          <button onClick={runQuery} disabled={!(error === null)} className='bg-blue-500 hover:bg-blue-700 disabled:bg-blue-300 py-2 px-4 my-3.5 rounded mr-3' type='submit'>Run Query</button>
          <button onClick={() => {
          setQuery(format(query, {
            language: 'sqlite',
            tabWidth: 4,
            useTabs: false,
            keywordCase: 'upper',
            dataTypeCase: 'upper',
            functionCase: 'upper',
        }))}} disabled={!(error === null)} className='bg-blue-500 hover:bg-blue-700 disabled:bg-blue-300 py-2 px-4 my-3.5 rounded mr-3' type='submit'>Format Code</button>
        </div>
        
        <ViewsTable views={views} onRemoveView={(name) => deleteView(name)} />
          <div className='flex text-base'><button onClick={initDb} className='bg-red-500 hover:bg-red-700 text-white font-semibold py-2 px-4 my-4 rounded mr-3 w-13' type='submit'>Reset DB</button>
          <button onClick={runQuery} className='bg-blue-500 hover:bg-blue-700 text-white font-semibold py-2 px-4 rounded my-3.5 w-13' type='submit'>Export Data</button></div>
        

        {result && <>
          {/* if correct result else display wrong result */}
          {isCorrectResult({columns: question.result.columns, data: question.result.values}, result) ? <><p className="text-green-500">Correct result!</p>
            <p className="break-words max-w-4xl mb-4 font-semibold text-left text-xl p-2 italic">... but it may not be correct! Make sure that all joins are complete and that the query only uses information from the assignment before exporting.</p>
          </> : <p className="text-red-500">Wrong result!</p>}
          {/* Two different result tables next to each other, actual and expected */}
          <div className="flex max-w-full py-4 w-full justify-center">
            <div className="flex-initial px-2 overflow-x-auto">
              <h2 className="text-3xl py-2">Actual</h2>
              <div className="overflow-x-auto justify-center grid">
                <ResultTable columns={result.columns} data={result.data} />
              </div>
            </div>
            <div className="flex-initial px-2 overflow-x-auto">
              <h2 className="text-3xl py-2">Expected</h2>
              <div className="overflow-x-auto justify-center grid">
                <ResultTable columns={question.result.columns} data={question.result.values} />
              </div>
            </div>
          </div>
        </>}
      </header>
    </div>
  );
}

export default App;
