//
// Copyright 2016 Next Century Corporation
// Licensed under the Apache License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License.
// You may obtain a copy of the License at
//
//     http://www.apache.org/licenses/LICENSE-2.0
//
// Unless required by applicable law or agreed to in writing, software
// distributed under the License is distributed on an "AS IS" BASIS,
// WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
// See the License for the specific language governing permissions and
// limitations under the License.
//

module.exports = function(config){
  config.set({

    basePath : '',

    colors: true,

    // Notes:  This runs against the latest succesful build of neon.js hosted on neonframework.org as
    // neon-gtd is kept in lock-step with Neon.  Change this if necessary to test against a custom 
    // Neon build.  Note that the base neon.js file also includes jquery, lodash, and a few other
    // items that are not explicitly pulled in here.
    files : [
        'client/bower_components/lodash/dist/lodash.js',
        'client/bower_components/log4javascript/js/log4javascript.js',
        'client/bower_components/node-uuid/uuid.js',
        'client/bower_components/postal/lib/postal.js',
        'client/bower_components/jquery/dist/jquery.min.js',
        'client/bower_components/angular/angular.js',
        'client/bower_components/angular-route/angular-route.min.js',
        'client/bower_components/angular-mocks//angular-mocks.js',
        'client/bower_components/ag-grid/dist/ag-grid.js',
        'https://s3.amazonaws.com/neonframework.org/neon/versions/latest/neon-nodeps.js',
        'client/bower_components/javascript-detect-element-resize/jquery.resize.js',
        'client/bower_components/opencpu/opencpu-0.5.js',
        'client/bower_components/user-ale/client/www/js/draper.activity_logger-2.1.1.js',
        'client/bower_components/user-ale/client/www/js/draper.activity_worker-2.1.1.js',
        'client/bower_components/d3/d3.min.js',
        'client/bower_components/openlayers/OpenLayers.js',
        'client/bower_components/heatmapjs/build/heatmap.js',
        'client/bower_components/angular-linkify/angular-linkify.js',
        'client/assets/vendor/openlayers-heatmapjs/heatmap-openlayers.js',
        'client/bower_components/jquery.tagcloud/jquery.tagcloud.js',
        'client/bower_components/jquery.linky/jquery.linky.min.js',
        'client/bower_components/jquery-ui/ui/minified/jquery-ui.min.js',
        'client/bower_components/bootstrap/dist/js/bootstrap.min.js',
        'client/bower_components/ngDraggable/ngDraggable.js',
        'client/app/namespaces.js',
        'client/app/test.js',
        'client/app/neon.helpers.js',
        'client/app/*.service.js',
        'client/components/**/*.js',
        'client/components/**/*.html'
    ],

    preprocessors: {
      '**/*.html': ['ng-html2js']
    },

    reporters: ['progress', 'junit'],

    ngHtml2JsPreprocessor: {
      stripPrefix: 'client/',
      moduleName: 'neonTemplates'
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
