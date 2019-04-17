const http = require('http');
const https = require('https');
const querystring = require('querystring');
const fs = require('fs');
const url = require('url');

const credentials_json = fs.readFileSync('./auth/credentials.json', 'utf-8');
const credentials = JSON.parse(credentials_json);
let post_data = {
	'client_id': credentials.client_id,
	'client_secret': credentials.client_secret,
	'grant_type': 'client_credentials'
}
post_data = querystring.stringify(post_data);
let options ={
	'method': 'POST',
	'headers':{
		'Content-Type': 'application/x-www-form-urlencoded',
		'Content-Length': post_data.length
	}
}

const server_address = 'localhost';
const port = 8000;

let search_url = '';
let token = '';
const endpoints = 'https://api.spotify.com/v1/search';

let authentication_cache = './auth/authentication_res.json';

let genres = '';
let image_url = '';
let name = '';

// Request for token, save at local and record expiration time
function recieved_authentication(authentication_res, res, user_input, request_sent_time){
	authentication_res.setEncoding("utf8");
	let body = "";
	authentication_res.on("data", data => {body += data;});
	authentication_res.on("end", () => {
		let authentication_res_data = JSON.parse(body);
		console.log(authentication_res_data);
	
		token = authentication_res_data.access_token;
		authentication_res_data.expiration = request_sent_time.getTime() + 3599900;
		
		create_cache_auth(authentication_res_data);
		create_search_req(authentication_res_data, res, user_input, request_sent_time);
	});
}

// Get user search key word from url 
function create_search_req(authentication_res_data, res, user_input, request_sent_time){
	let detail_object = {'access_token': authentication_res_data.access_token,
						 'q': user_input.artist,
						 'type': 'artist'
						 }
	let detail_string = querystring.stringify(detail_object);
	let search_url = endpoints + '?' + detail_string;

	let search_req = https.request(search_url, search_res => {
		search_res.setEncoding("utf8");	
		let body = "";
		search_res.on("data", data => {body += data});
		search_res.on("end", () => {
			let search_res_data = JSON.parse(body);
			// console.log(search_res_data);
			genres = search_res_data.artists.items[0].genres;
			image_url = search_res_data.artists.items[0].images[0].url;
			name = search_res_data.artists.items[0].name;

			download_image(image_url, res);
		});
	});
    search_req.end();
}

function create_cache_auth(authentication_res_data){
	let data_json = JSON.stringify(authentication_res_data);
	fs.writeFile('./auth/authentication_res.json', data_json, (err)=>{
		if(err) throw err;
		console.log('Authentication cache created.');
	});
	
}

// check if requested image exists in local, 
// either open from local or download then send webpage to client
function download_image(image_url, res){
	let image_req = https.get(image_url, image_res => {
		let len = image_url.lastIndexOf('/')+1;
		let file_name = image_url.substring(len)+'.jpg';	

		let img_path = './artists/' + file_name;
		
		let img_valid = false;
		if(fs.existsSync(img_path)){
			console.log('Image already exists.');
			img_valid = true;
		}
		else{
			console.log('Image need to be downloaded');
		}
		
		if(img_valid){
			let webpage = `<h1>${name}</h1><p>${genres.join()}</p><img src="./artists/${file_name}" />`;
			// Send website to user
			res.end(webpage);
		}
		else{
			
			let new_img = fs.createWriteStream(img_path, {'encoding':null});
			image_res.pipe(new_img);
			new_img.on('finish', function(){
				let webpage = `<h1>${name}</h1><p>${genres.join()}</p><img src="./artists/${file_name}" />`;	
				// Send website to user
				res.end(webpage);
				console.log('Image downloaded: ' + file_name);
			});
		}
	});
	image_req.on('error', function(err){console.log(err);});

	image_req.end();	
}

// Create server
let server = http.createServer((req,res)=>{
	if(req.url === '/'){
		res.writeHead(200,{'Content-Type':'text/html'});
		let html_stream = fs.createReadStream('./index.html','utf8');
		html_stream.pipe(res);
	} else if(req.url.includes('favicon')){
		res.writeHead(404);
		res.end();
	} else if(req.url.includes('/artists/')){
		let file_name = req.url;
		file_name = '.' + file_name;
		
		let image_stream = fs.createReadStream(file_name);

		res.writeHead(200,{'Content-Type':'image/jpeg'});
		image_stream.pipe(res);
		image_stream.on('error', function(err){
			console.log(err);
			res.writeHead(404);
			return res.end();
		});
		// console.log('File exists: ' + file_name);
	} else if(req.url.includes('search')){
		let user_input = url.parse(req.url, true).query;		// get user search key word
		
		let cache_valid = false;
		if(fs.existsSync(authentication_cache)){
			content = fs.readFileSync(authentication_cache, 'utf-8');
			cached_auth = JSON.parse(content);
			if(cached_auth.expiration > Date.now()){
				cache_valid = true;
				console.log('Token existed already.');
			}
			else{
				console.log('Token Expired.');
			}
		}
		if(cache_valid){
			create_search_req(cached_auth, res, user_input);
		}
		else{
			const authentication_req_url = 'https://accounts.spotify.com/api/token';
			let request_sent_time = new Date();
			let authentication_req = https.request(authentication_req_url, options, authentication_res => {
				recieved_authentication(authentication_res, res, user_input, request_sent_time);
			});
			authentication_req.on('error', (e) => {
				console.error(e);
			});
			authentication_req.write(post_data);
			console.log("Requesting Token...");
			authentication_req.end();
		}
	} else{
		res.writeHead(404);
		res.end();
	}
});

// run server
server.listen(port,server_address);
console.log('Now Listening Port '+port);