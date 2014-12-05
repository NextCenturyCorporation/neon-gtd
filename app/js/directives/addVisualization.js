'use strict';
/*
 * Copyright 2014 Next Century Corporation
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
 * This directive will add a button suitable for application nav bars that
 * will open a visualization selector dialog when pressed.  The dialog allows a user
 * to select a number of visualization types and will add Angular Gridster configuration
 * elements for them to an array of configuration items.  The array of active items
 * can be provide via a two-way binding.
 *
 * @class neonDemo.directives.addVisualization
 * @constructor
 */
angular.module('neonDemo.directives')
.directive('addVisualization', function() {
	return {
		templateUrl: 'partials/directives/addVisualization.html',
		restrict: 'EA',
		scope: {
			gridsterConfigs: "="
		},
		link: function($scope, $element) {
			$element.addClass('add-visualization');

			/** Hold the default size, name, and directive settings for allowed visualizations. */
			$scope.visualizations = [{
				name: 'Timeline',
				sizeX: 6,
				sizeY: 1,
				type: 'timeline-selector',
				icon: 'img/Neon_60x34.png'
			},{
				name: 'Map',
				sizeX: 6,
				sizeY: 2,
				type: 'heat-map',
				icon: 'img/Neon_60x34.png'
			},{
				name: 'Linechart',
				sizeX: 2,
				sizeY: 2,
				type: 'linechart',
				icon: 'img/Neon_60x34.png'
			},{
				name: 'Barchart',
				sizeX: 2,
				sizeY: 2,
				type: 'barchart',
				icon: 'img/Neon_60x34.png'
			},{
				name: 'Ops Clock',
				sizeX: 2,
				sizeY: 2,
				type: 'circular-heat-form',
				icon: 'img/Neon_60x34.png'
			},{
				name: 'Tag Cloud',
				sizeX: 6,
				sizeY: 1,
				type: 'tag-cloud',
				bindings: {
					"tag-field": "'hashtags'"
				},
				icon: 'img/Neon_60x34.png'
			},{
				name: 'Count By',
				sizeX: 2,
				sizeY: 2,
				type: 'count-by',
				icon: 'img/Neon_60x34.png'
			}];

			/**
			 * Returns the visualization types selected by the user in the dialog managed by this directive.
			 * @returns Array{Object} Selected visualization configurations
			 * @method getSelected
			 * @private
			 */
			function getSelected() {
				return _.filter($scope.visualizations, function(visualization) {
					return visualization.selected === true;
				});
			}

			/**
			 * Adds one instance of each user-selected visualization type to the gridsterConfigs provided as
			 * a binding to this directive instance.
			 * @method addVisualizations
			 */
			$scope.addVisualizations = function() {
				var selected = getSelected();
				_.each(selected, function(visualization) {
					// Clone the items.  Note that underscore's clone is shallow, so also
					// clone the default bindings explicitly.
					var newVis = _.clone(visualization);
					newVis.bindings = _.clone(visualization.bindings);
					newVis.id = uuid();
					$scope.gridsterConfigs.push(newVis);
				});

				$scope.deselectAll();
			};

			/**
			 * Deselects all visualization configurations in the dialog managed byt his directive.
			 * @method deselectAll
			 * @private
			 */
			$scope.deselectAll = function() {
				_.each($scope.visualizations, function(visualization) {
					visualization.selected = false;
				});
			};
		}
	};
});
