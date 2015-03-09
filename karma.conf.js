module.exports = function(config){
  config.set({

    basePath : '',

    colors: true,

    // Notes:  This assumes neon has been built and exists at the same directory level as 
    // neon-gtd.  Note that the base neon.js file also includes jquery, lodash, and a few other
    // items that are not explicitly pulled in here.
    files : [
        'app/lib/angular/js/angular.min.js',
        'app/lib/angular-route/js/angular-route.min.js',
        'app/lib/angular-mocks/js/angular-mocks.js',
        'app/lib/angular-gridster/js/angular-gridster.min.js',
        '../neon/neon-server/build/js/neon.js',
        'app/lib/jquery/js/jquery.min.js',
        'app/lib/javascript-detect-element-resize/js/jquery.resize.js',
        'app/lib/opencpu/js/opencpu-0.5.js',
        'app/lib/xdatalogger/js/draper.activity_logger-2.1.1.js',
        'app/lib/xdatalogger/js/draper.activity_worker-2.1.1.js',
        'app/lib/d3/js/d3.min.js',
        'app/lib/openlayers/OpenLayers.js',
        'app/lib/openlayers-heatmap/js/heatmap.js',
        'app/lib/openlayers-heatmap/js/heatmap-openlayers.js',
        'app/lib/jquery.tagcloud/js/jquery.tagcloud.js',
        'app/lib/threedubmedia.jquery.event/js/jquery.event.drag.js',
        'app/lib/threedubmedia.jquery.event/js/jquery.event.drop.js',
        'app/lib/jquery.linky/js/jquery.linky.min.js',
        'app/lib/jquery-ui/js/jquery-ui.min.js',
        'app/js/vendor/slick-grid/js/slick.core.js',
        'app/js/vendor/slick-grid/js/slick.grid.js',
        'app/js/vendor/slick-grid/js/slick.dataview.js',
        'app/js/vendor/slick-grid/js/slick.autotooltips.js',
        'app/js/vendor/slick-grid/js/slick.rowselectionmodel.js',
        'app/lib/mergesort/js/merge-sort.js',
        'app/lib/bootstrap/js/bootstrap.min.js',
        'app/js/appConfig.js',
        'app/js/app.js',
        'app/js/namespaces.js',
        'app/js/neonDemoController.js',
        'app/js/**/*Service.js',
        'app/js/charts/**/*.js',
        'app/js/coremap/**/*.js',
        'app/js/tables/**/*.js',
        'app/js/neon-extensions/**/*.js',
        'app/js/directives/**/*.js',
        'test/directives/*.js',
        '**/*.html',
    ],

    preprocessors: {
      '**/*.html': ['ng-html2js']
    },

    reporters: ['progress', 'junit'],

    ngHtml2JsPreprocessor: {
      stripPrefix: 'app/'
    },

    singleRun : true,

    frameworks: ['jasmine'],

    browsers : ['PhantomJS'],

    junitReporter : {
      outputFile: 'reports/unitTests.xml',
      suite: 'unit'
    }

  });
};
