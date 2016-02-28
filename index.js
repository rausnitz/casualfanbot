var request = require('request');
var cheerio = require('cheerio');
var pg = require('pg');
var Twitter = require('twitter');

var sourceUrl = 'http://projects.fivethirtyeight.com/2016-nba-picks/';

var twitter = new Twitter({
  consumer_key: process.env.TWITTER_KEY,
  consumer_secret: process.env.TWITTER_KEY_SECRET,
  access_token_key: process.env.TWITTER_TOKEN,
  access_token_secret: process.env.TWITTER_TOKEN_SECRET
});

var teams = { // to guarantee a tweet <=140 characters, shorten some team names
  '76ers': '76ers',
  'Bucks': 'Bucks',
  'Bulls': 'Bulls',
  'Cavaliers': 'Cavs',
  'Celtics': 'Celtics',
  'Clippers': 'Clips',
  'Grizzlies': 'Grizz',
  'Hawks': 'Hawks',
  'Heat': 'Heat',
  'Hornets': 'Hornets',
  'Jazz': 'Jazz',
  'Kings': 'Kings',
  'Knicks': 'Knicks',
  'Lakers': 'Lakers',
  'Magic': 'Magic',
  'Mavericks': 'Mavs',
  'Nets': 'Nets',
  'Nuggets': 'Nuggets',
  'Pacers': 'Pacers',
  'Pelicans': 'Pelicans',
  'Pistons': 'Pistons',
  'Raptors': 'Raptors',
  'Rockets': 'Rockets',
  'Spurs': 'Spurs',
  'Suns': 'Suns',
  'Thunder': 'Thunder',
  'Timberwolves': 'Wolves',
  'Trail Blazers': 'Blazers',
  'Warriors': 'Warriors',
  'Wizards': 'Wizards'
};

function send_tweet(a, b) {
  var message = "New NBA top five: ";
  message += a.join(", ") + " (was " + b.join(", ") + ") ";
  message += sourceUrl;
  console.log(message);
  twitter.post('statuses/update', {status: message}, function(error, tweet, response){
    if (error) {
      console.log(error);
    }
  });
}

request({uri: sourceUrl, gzip: true}, function (error, response, html) {
  if (!error && response.statusCode == 200) {

	  var $ = cheerio.load(html);

		pg.connect(process.env.DATABASE_URL + '?ssl=true', function(err, client) {
			if (err) throw err;
			client.query('CREATE TABLE IF NOT EXISTS nba (rank smallint, team varchar(255), latest boolean);');

      var inserts = [];
      $("#teams-table tbody tr").each(function(index){ // each team's row in the rankings table
          var info = {};
          info.team = $(this).find("td.team a").html().trim();
          info.rank = index + 1;
          inserts.push(info);
			});

      var buildInsert = function(rows) {
        var params = [];
        var chunks = [];
        for (var i = 0; i < rows.length; i++) {
          var row = rows[i];
          var valuesClause = [];
          params.push(row.rank);
          valuesClause.push('$' + params.length);
          params.push(row.team);
          valuesClause.push('$' + params.length);
          params.push(true);
          valuesClause.push('$' + params.length);
          chunks.push('(' + valuesClause.join(', ') + ')');
        }
        return {
          text: 'INSERT INTO nba(rank, team, latest) VALUES ' + chunks.join(', '),
          values: params
        }
      };

      if (inserts.length == 30) {
        client.query("DELETE FROM nba WHERE latest = FALSE;", function(err, result){
          client.query("UPDATE nba SET latest = FALSE;", function(err, result){
            client.query(buildInsert(inserts), function (err, result){
              client.query("SELECT * FROM nba WHERE rank IN (1,2,3,4,5);", function(err, result){
                var top = [];
                var old_top = [];
                for (var i = 0; i < result.rows.length; i++) {
                  var row = result.rows[i];
                  if (row.latest) {
                    top[row.rank - 1] = teams[row.team];
                  } else {
                    old_top[row.rank - 1] = teams[row.team];
                  }
                }

                function change_detector(a, b) {
                  if (a.length == 0 || b.length == 0) return false;
                  for (var i = 0; i < a.length; i++) {
                    if (a[i] != b[i]) return true;
                  }
                  return false;
                }

                if (change_detector(top, old_top)) {
                  send_tweet(top, old_top);
                } else {
                  console.log("Scraper ran. Nothing changed.");
                }
                client.end();
              });
            });
          });
        });
      }

		});
	}
});
