const express = require("express");
const cors = require("cors");
const dotenv = require("dotenv").config();
const mongoose = require("mongoose");
const axios = require("axios");
var parser = require("xml2json");

mongoose
  .connect(process.env.MONGO_URI)
  .then(() => console.log("connected to db"))
  .catch((err) => console.log(err));

const app = express();

//middlewares
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

async function fetchGithubProfile(username) {
  const url = `https://api.github.com/users/${username}`;
  const githubStatsUrl = `https://github-readme-stats.vercel.app/api/top-langs/?username=${username}&size_weight=0.5&count_weight=0.5`;
  const response = await axios.get(url, {
    headers: {
      Authorization: `Bearer ${process.env.GITHUB_TOKEN}`,
    },
  });
  return response.data;
}

//fetch repos
async function getReposStats(username) {
  const url = `https://api.github.com/users/${username}/repos`;
  const response = await axios.get(url, {
    headers: {
      Authorization: `Bearer ${process.env.GITHUB_TOKEN}`,
    },
  });

  return response.data;
}

//fetch language stats from a repo
async function getLanguageStats(username, repo) {
  const url = `https://api.github.com/repos/${username}/${repo}/languages`;
  try {
    const response = await axios.get(url, {
      headers: {
        Authorization: `Bearer ${process.env.GITHUB_TOKEN}`,
      },
    });
    return response.data; // This will return an object with language stats
  } catch (error) {
    console.error(`Error fetching language stats for ${repo}:`, error.message);
    throw error; // Re-throw the error to be handled by the caller
  }
}

//calculate percentage
async function calculatePercentage(languageStats) {
  const languageMap = new Map();

  for (const [language, value] of Object.entries(languageStats)) {
    languageMap.set(language, (languageMap.get(language) || 0) + value);
  }

  return Object.fromEntries(languageMap);
}

//aggregate the repo stats and fint the total number of lines wrote by the user
async function aggregateRepoStats(username) {
  console.log("aggregating repos");
  const repos = await getReposStats(username);
  let totalStats = {};

  // Use Promise.all to handle all async operations
  const languagePromises = repos.map((repo) =>
    getLanguageStats(username, repo.name)
  );

  const allLanguageStats = await Promise.all(languagePromises);
  // Combine all stats
  allLanguageStats.forEach((stats) => {
    for (const [lang, value] of Object.entries(stats)) {
      totalStats[lang] = (totalStats[lang] || 0) + value;
    }
  });
  console.log(totalStats);
  return totalStats;
}



async function getSkillMetrics(username) {
    const query = {
        query: ` 
            query {
                user(login:"${username}"){
                    name
                    repositories(last:20){
                        nodes{
                            name
                            description
                            stargazerCount
                            forkCount
                            object(expression:"HEAD:package.json"){
                                ...on Blob{
                                    text
                                }
                            }
                        }
                    }

                }
            }
        `
    }

    try{
        const response = await axios.post("https://api.github.com/graphql", query, {
            headers: {
                Authorization: `Bearer ${process.env.GITHUB_TOKEN}`,
                "Content-Type": "application/json",
              },
        })
    
        return response.data;
    } catch(err){
        return err;
    }

    
}

async function getAccountStats(username){
    const query = {
        query: `
            query {
                user(login: "${username}"){
                    name
                    contributionsCollection {
                        totalCommitContributions
                        totalIssueContributions
                        totalPullRequestContributions
                        totalPullRequestReviewContributions
                    }
                }
            }
        `
    }
    const response = await axios.post("https://api.github.com/graphql", query, {
        headers: {
            Authorization: `Bearer ${process.env.GITHUB_TOKEN}`,
            "Content-Type": "application/json",
          },
    })

    return response.data;
}

async function getContributions(username) {
    const query = {
      query: `
        query {
          user(login: "${username}") {
            name
            repositories(last: 20, orderBy: {field: UPDATED_AT, direction: DESC}) {
              nodes {
                name
                primaryLanguage {
                  name
                }
                defaultBranchRef {
                  target {
                    ... on Commit {
                      history(first: 100) {
                        nodes {
                          committedDate
                          additions
                          deletions
                          message
                        }
                      }
                    }
                  }
                }
              }
            }
          }
        }
      `,
    };
  
    try {
      const response = await axios.post(
        "https://api.github.com/graphql",
        query,
        {
          headers: {
            Authorization: `Bearer ${process.env.GITHUB_TOKEN}`,
            "Content-Type": "application/json",
          },
        }
      );
  
      const repositories = response.data.data.user.repositories.nodes;
      
      // Map each repository's commits to our desired format
      const allCommits = repositories.flatMap(repo => {
        // Skip repos with no default branch or history
        if (!repo.defaultBranchRef?.target?.history?.nodes) {
          return [];
        }
  
        return repo.defaultBranchRef.target.history.nodes.map(commit => ({
          username,
          repoName: repo.name,
          language: repo.primaryLanguage?.name || 'Unknown',
          commitDate: commit.committedDate,
          additions: commit.additions,
          deletions: commit.deletions,
          message: commit.message
        }));
      });
  
      return allCommits;
    } catch (error) {
      console.error('Error fetching GitHub contributions:', error.message);
      throw error; // Re-throw the error to be handled by the caller
    }
  }

// basic routes
app.get("/api/v1/analysis/:username", async (req, res) => {
  try {
    const username = req.params.username;
    // const result = await aggregateRepoStats(username)
    const [repoStats, contributions, accountStats, skillMetrics] = await Promise.all([
      aggregateRepoStats(username),
      getContributions(username),
      getAccountStats(username),
      getSkillMetrics(username)
    ]);
    // const data = await getContributions(username)
    res.send({ repoStats, accountStats, skillMetrics, contributions});
  } catch (err) {
    res.send(err);
  }
});

app.listen(3000, () => {
  console.log("server is running on port 3000");
});
