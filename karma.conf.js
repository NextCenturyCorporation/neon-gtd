module.exports = function(config){
  config.set({

    basePath : './',

    files : [
      'app/lib/angular/js/angular.min.js',
      'app/lib/angular-route/angular-route.js',
      'app/lib/angular-mocks/angular-mocks.js',
      '../neon/neon-server/build/js/neon.js',
      'app/js/app.js',
      'app/js/time/*.js',
      'test/time/*.js',
    ],

    singleRun : true,

    frameworks: ['jasmine'],

    browsers : ['PhantomJS'],

    plugins : [
            'karma-chrome-launcher',
            'karma-firefox-launcher',
            'karma-phantomjs-launcher',
            'karma-jasmine',
            'karma-junit-reporter'
            ],

    junitReporter : {
      outputFile: 'test_out/unit.xml',
      suite: 'unit'
    }

  });
};
