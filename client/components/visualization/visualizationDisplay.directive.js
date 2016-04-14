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

/**
 * This generic directive represents the display for a Neon dashboard visualization.
 * @namespace neonDemo.directives
 * @class visualizationDisplay
 * @constructor
 */
angular.module('neonDemo.directives').directive('visualizationDisplay', function() {
    return {
        // HTML template and controller are set during compilation by the visualization superclass.
        compile: function()  {
            return {
                pre: function($scope, $element) {
                    // This directive is used in conjunction with an ng-include, so the element is transcluded to the outer
                    // scope which contains the appropriate visualization ID.
                    $element.attr("id", $scope.visualizationId);
                },
                post: function($scope) {
                    neon.ready(function() {
                        $scope.init();
                    });
                }
            };
        }
    };
});

