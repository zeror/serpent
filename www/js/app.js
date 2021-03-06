/*jshint forin:false, sub:true */
"use strict";

define(function(require) {
  // Libraries
  var $ = require('zepto');
  var assets = require('./assets');
  var utils = require('./utils');
  var config = require('./config');

  var document = window.document;

  // Set up requestAnimationFrame
  var requestAnimationFrame = window.requestAnimationFrame ||
                              window.mozRequestAnimationFrame ||
                              window.webkitRequestAnimationFrame ||
                              window.msRequestAnimationFrame ||
                              function (callback) {
                                setTimeout(callback, 1000/60);
                                return 1;
                              };
  var animationFrameId;

  /** Global game metadata */
  var blocksize = 16;
  var game = {
    // Block width and height
    width: 32,
    height: 32,
    // Paused?
    paused: false,
    // Level index
    levelidx: 0
  };
  var level; // Shortcut to this level's metadata.
  var then; // Timestamp of last animation frame

  // Create the canvas
  var canvas = document.createElement('canvas');
  var ctx = canvas.getContext('2d');
  canvas.width = game.width * blocksize;
  canvas.height = game.height * blocksize;
  canvas.id = 'game-canvas';
  $('#gamebox').append(canvas);

  // Directions
  var dirs = {
    38: 1, // up
    39: 2, // right
    40: 3, // down
    37: 4 // left
  };

  /**
    Game objects
  */

  // Player
  function Snake() {
    this.speed = config.getSpeed(); // movement in blocks per second
    this.length = 8; // snake length
    this.dir = level.dir || 2; // direction
    this.path = [level.start || {x: game.width / 2, y: game.height / 2}]; // Track snake's movement
    this.lives = (snake === undefined || !snake) ? 3 : snake.lives; // 3 lives by default.

    this.since_last_update = 0; // Time since last update
    this.dirchange = false; // direction change in progress?
  }
  var snake;

  // Foodz
  function Food() {
    this.ttl = 60; // Food time to live.
    this.val = 5; // Growth value for snake when eaten.

    do {
      this.x = utils.getRandomInt(0, game.width - 1);
      this.y = utils.getRandomInt(0, game.height - 1);
    } while (is_collision(this));
  }
  Food.prototype.render = function() {
    if (!('loaded' in assets.images['food'])) {
      return;
    }

    ctx.drawImage(assets.images['food'].img, this.x * blocksize, this.y * blocksize);
  }
  var food = []; // List of food items on the screen.

  // Collision detection
  function is_collision(pos) {
    var paths = [snake.path, level.walls];
    for (var p in paths) {
      var path = paths[p];
      for (var i in path) {
        if (pos.x === path[i].x && pos.y === path[i].y) {
          return true;
        }
      }
    }
    return false;
  }

  function moveSnakeOnKeyPress(e) {
    // Pause / unpause?
    if (e.keyCode === 80) { // "p"
      pause();
      return;
    }

    // No other commands while paused or while direction change already in progress.
    if (game.paused || snake.dirchange) {
      return;
    }

    // Handle direction changes.
    if (!(e.keyCode in dirs)) {
      return;
    }

    e.preventDefault();

    // Avoid opposite directions.
    // This is probably faster than (snake.dir + 2 > 4 ? snake.dir - 2 : snake.dir + 2)
    var opposites = {1: 3, 2: 4, 3: 1, 4: 2};
    if (dirs[e.keyCode] === opposites[snake.dir]) {
      return;
    }

    // Change direction of snake
    snake.dirchange = true;
    snake.dir = dirs[e.keyCode];
  }

  function moveSnakeOnTouch(e) {
    // No other commands while paused or while direction change already in progress.
    if (game.paused || snake.dirchange) {
      return;
    }

    e.preventDefault();

    snake.dirchange = true;
    if ([1, 3].indexOf(snake.dir) !== -1) { // up or down
      var relX = e.pageX - e.target.offsetLeft;
      if (relX > canvas.offsetWidth / 2) { // right
        snake.dir = 2;
      } else { // left
        snake.dir = 4;
      }

    } else { // Left or right
      var relY = e.pageY - e.target.offsetTop;
      if (relY > canvas.offsetHeight / 2) { // down
        snake.dir = 3;
      } else { // up
        snake.dir = 1;
      }
    }
  }

  // Reset game to original state
  function reset() {
    // NB: Does not reset to level 0
    level = assets.levels[game.levelidx];
    snake = new Snake();
    food = [];
  }


  // Update game objects
  function update(modifier) {
    snake.since_last_update += modifier;
    if (snake.since_last_update < 1000 / snake.speed) {
      return; // no update due yet
    }

    // Update due
    snake.since_last_update -= 1000 / snake.speed;

    // Age all food items, remove "expired" ones.
    for (var i in food) {
      food[i].ttl -= 1;
    }
    food = food.filter(function(item) { return item.ttl > 0; })

    // Add some food? (nom). But no more than 3.
    if (food.length < 3 && Math.random() < (0.08 / (food.length + 1))) {
      food.push(new Food());
    }

    // Calculate new snake position.
    var old_pos = snake.path[snake.path.length - 1];
    var new_pos = {x: old_pos.x, y: old_pos.y};
    switch (snake.dir) {
      case 1: new_pos.y -= 1; break;
      case 2: new_pos.x += 1; break;
      case 3: new_pos.y += 1; break;
      case 4: new_pos.x -= 1; break;
    }
    // Normalize values (allows teleporting across sides)
    new_pos.x = (new_pos.x + game.width) % game.width;
    new_pos.y = (new_pos.y + game.height) % game.height;

    // Did we run into a wall or ourselves?
    if (is_collision(new_pos)) {
      snake.lives -= 1;
      if (snake.lives === 0) {
        // Game over!
        game.levelidx = 0;
        snake = null;
      }
      reset();
      return;
    }

    // Nom nom nom
    for (var i in food) {
      if (food[i].x === new_pos.x && food[i].y === new_pos.y) {
        snake.length += food[i].val;
        if ('points' in level && snake.length >= level.points) {
          // Level up!
          game.levelidx += 1;
          reset();
          return;
        } else {
          food.splice(i, 1); // Remove this.
          break;
        }
      }
    }

    // Add new position to path, crop tail if snake length has been reached.
    snake.path.push(new_pos);
    if (snake.path.length > snake.length) {
      snake.path.shift();
    }

    // Allow next direction change.
    snake.dirchange = false;
  }


  // Draw everything
  function render() {
    // Empty the canvas.
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    if ('loaded' in level) {
      ctx.fillStyle = '#777';
      for (var i in level.walls) {
        ctx.fillRect(level.walls[i].x * blocksize,
                     level.walls[i].y * blocksize,
                     blocksize, blocksize);
      }
    }

    // Draw remaining lives.
    if ('loaded' in assets.images['snake']) {
      ctx.globalAlpha = 0.5;
      for (var i = 0; i < snake.lives; i++) {
        ctx.drawImage(assets.images['snake'].img,
                      canvas.width - blocksize - (i + 1) * 1.2 * assets.images['snake'].img.width,
                      canvas.height - assets.images['snake'].img.height - blocksize - 5);
      }
      ctx.globalAlpha = 1;
    }

    // Draw food items
    for (var i in food) {
      food[i].render();
    }

    // Draw snake
    ctx.fillStyle = 'rgb(200, 0, 0)';
    for (var i in snake.path) {
      ctx.fillRect(snake.path[i].x * blocksize, snake.path[i].y * blocksize,
                   blocksize, blocksize);
    }

    // Draw level no.
    ctx.fillStyle = 'rgb(0, 0, 0)';
    ctx.font = '14pt SilkscreenNormal, Arial, sans-serif';
    ctx.textAlign = 'right';
    ctx.textBaseline = 'bottom';
    ctx.fillText('Level: ' + (game.levelidx + 1), canvas.width - blocksize,
                 canvas.height + 1);

    // Pause message?
    if (game.paused) {
      ctx.fillStyle = 'rgb(0, 0, 0)';
      ctx.font = '36pt SilkscreenNormal, Arial, sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('PAUSE', canvas.width / 2, canvas.height / 2);
    }
  }

  // Pause the game.
  function pause(force) {
    if (animationFrameId || force) { // Pause
      game.paused = true;
      animationFrameId = null;
    } else { // Unpause
      game.paused = false;
      then = Date.now(); // Reset.
      animationFrameId = requestAnimationFrame(main);
    }
  }

  // Init: Hook up event handlers and such.
  function init() {
    // Pause when leaving the screen.
    $(window).blur(function() {
      pause(true);
    });

    // Handle keyboard controls
    $(window).keydown(moveSnakeOnKeyPress);

    // Handle click and touch events.
    $(canvas).bind('touchStart', moveSnakeOnTouch);
    $(canvas).click(moveSnakeOnTouch);
  }

  // The main game loop
  function main() {
    var now = Date.now();
    var delta = now - then;

    update(delta);
    render();

    then = now;
    if (!game.paused) {
      animationFrameId = requestAnimationFrame(main);
    }
  }

  // Let's play this game!
  $('#start-game').click(function(e) {
    e.preventDefault();

    $('body').addClass('running');

    init();
    reset();
    then = Date.now();
    main();
  });

// End require.js
});
