'use strict';

/*
 * Copyright 2016 Next Century Corporation
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 *
 */

angular.module('neonDemo.directives').directive('visualizationDisplay', function() {
    return {
        scope: {
            active: '=',
            functions: '='
        },
        link: function($scope, $element) {
            // The display is the last to load so initialize the visualization once the display has finished loading.
            $scope.functions.init();
        }
    };
});

angular.module('neonDemo.directives').directive('visualizationHeading', function() {
    return {
        scope: {
            active: '=',
            filter: '=',
            functions: '='
        }
    };
});

angular.module('neonDemo.directives').directive('visualizationOptions', function() {
    return {
        scope: {
            active: '=',
            bindings: '=',
            fields: '=',
            functions: '='
        }
    };
});

